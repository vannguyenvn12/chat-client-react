import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

// ✅ Socket.IO version
const DEFAULT_API = "http://localhost:8787/push";
// Với Socket.IO bạn chỉ cần base URL + path (không dùng ws://)
const DEFAULT_SIO = "http://localhost:8787";
const DEFAULT_SIO_PATH = "/ws";

const DEFAULT_GAS_EXPORT =
  "https://script.google.com/macros/s/AKfycbyS3h4Ci958a33mz2tWopo02R1jwQvZaUQrezmT6AzsaqkCc0NkLm4CxPJU_o2lklZo/exec";

export default function VanGPTApp({
  apiUrl = DEFAULT_API,
  sioUrl = DEFAULT_SIO,
  sioPath = DEFAULT_SIO_PATH,
  exportUrl = DEFAULT_GAS_EXPORT,
}) {
  // ====== UI State ======
  const [chat, setChat] = useState([]); // [{id?, role: 'me'|'bot', text}]
  const [prompt, setPrompt] = useState("Viết 3 bữa ăn healthy dạng markdown.");
  const [anchors, setAnchors] = useState("tôi đã nói|bạn đã nói|chatgpt đã nói|you said");
  const [reqId, setReqId] = useState("");
  const [status, setStatus] = useState("ready");
  const [raw, setRaw] = useState("{}");
  const [loading, setLoading] = useState(false);

  // ====== Runtime refs ======
  const currentIdRef = useRef("");
  const lastMsgByIdRef = useRef({});
  const socketRef = useRef(null);
  const seenRef = useRef(new Set()); // de-dupe displayed push_result events

  const isOk = status === "ready" || status.startsWith("SIO connected");
  const showStatus = (text, ok = true) => setStatus(ok ? text || "ready" : text || "error");
  const setCurrentId = (id) => (currentIdRef.current = id || "");
  const safeFilename = (name) => name.replace(/[^a-z0-9\-_.]/gi, "_");

  const collectChatAsText = () => chat.map((m) => `${m.role}: ${m.text}`).join("\n");
  const addMsg = (role, text, id) => setChat((prev) => [...prev, { role, text, id }]);
  const replaceBotMsgById = (id, text) => {
    setChat((prev) => {
      const filtered = prev.filter((m) => !(m.role === "bot" && m.id === id));
      return [...filtered, { role: "bot", text, id }];
    });
  };

  // ====== HTTP push helper (giữ nguyên) ======
  const callPush = async (payload) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      setRaw(JSON.stringify(json, null, 2));
      if (!res.ok || !json.ok) {
        showStatus(json.error || `HTTP ${res.status}`, false);
        return json;
      } else {
        showStatus("OK");
        return json;
      }
    } catch (e) {
      const err = String(e);
      showStatus(err, false);
      setRaw(JSON.stringify({ error: err }, null, 2));
      return { ok: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  // ====== Actions ======
  const onSend = async () => {
    const p = (prompt || "").trim();
    if (!p) return;
    const id = (reqId || ``).trim() || `job-${Date.now()}`;
    setCurrentId(id);
    addMsg("me", p, id);
    setPrompt("");

    const payload = { id, type: "ask_block", prompt: p };
    await callPush(payload); // server sẽ phát lệnh qua Socket.IO tới extension
  };

  const onGetLast = async () => {
    const id = (reqId || ``).trim() || `last-${Date.now()}`;
    setCurrentId(id);
    const payload = { id, type: "get_last_after", anchors: anchors.split("|").map(s => s.trim()).filter(Boolean) };
    await callPush(payload);
  };

  const postText = async (url, text) => {
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/plain; charset=utf-8",
        accept: "application/json, text/plain;q=0.9, */*;q=0.5",
      },
      body: text,
    });
  };

  const onPdfDownload = async () => {
    const text = collectChatAsText();
    if (!text) {
      addMsg("bot", "Không có nội dung để xuất PDF.");
      return;
    }
    setLoading(true);
    showStatus("Đang tạo PDF...");
    try {
      const res = await postText(exportUrl, text);
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        showStatus("Lỗi xuất: " + (errTxt || `HTTP ${res.status}`), false);
        return;
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let data = null;

      if (ct.includes("application/json")) {
        data = await res.json();
        setRaw(JSON.stringify(data, null, 2));
      } else if (ct.startsWith("text/")) {
        const txt = await res.text();
        setRaw(txt);
        try { data = JSON.parse(txt); } catch { }
      } else if (ct.startsWith("application/pdf")) {
        const blob = await res.blob();
        const fname = `${safeFilename((reqId || "export").trim() || "export")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`;
        triggerDownload(blob, fname);
        showStatus("Đã tải PDF");
        return;
      } else {
        const txt = await res.text();
        setRaw(txt);
        try { data = JSON.parse(txt); } catch { }
      }

      if (data?.pdf_base64) {
        const byteChars = atob(data.pdf_base64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNums);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const fname = `${safeFilename((reqId || "export").trim() || "export")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`;
        triggerDownload(blob, fname);
        showStatus("Đã tải PDF từ base64");
      } else if (data?.pdfUrl) {
        window.open(data.pdfUrl, "_blank", "noopener");
        showStatus("Đã mở link PDF");
      } else {
        showStatus("Không tìm thấy pdf_base64/pdfUrl trong phản hồi", false);
      }
    } catch (e) {
      showStatus(String(e), false);
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ====== Socket.IO (thay cho WebSocket) ======
  useEffect(() => {
    try {
      const socket = io(sioUrl, {
        path: sioPath,
        transports: ["websocket"], // ưu tiên websocket
      });
      socketRef.current = socket;

      socket.on("connect", () => showStatus("SIO connected"));
      socket.on("connect_error", (err) => showStatus(`SIO connect_error: ${err?.message || err}`, false));
      socket.on("disconnect", () => showStatus("SIO disconnected", false));

      // Nhận kết quả server phát (sau khi extension xử lý xong & emit client_result)
      socket.on("push_result", (msg) => {
        try {
          lastMsgByIdRef.current[msg.id] = msg;
          setRaw(JSON.stringify(lastMsgByIdRef.current[msg.id], null, 2));

          const key = msg.id + "::" + (msg.text || "");
          if (seenRef.current.has(key)) return;
          seenRef.current.add(key);
          setTimeout(() => seenRef.current.delete(key), 60000);

          if (msg.text) {
            const text = String(msg.text).replace("ChatGPT said", "VanGPT said");
            replaceBotMsgById(msg.id, text);
          }
        } catch { }
      });

      // (tùy chọn) nếu server có emit message khác
      // socket.on("server_push", (payload) => { ... });

      return () => {
        try { socket.off("push_result"); socket.disconnect(); } catch { }
      };
    } catch (e) {
      showStatus(String(e), false);
    }
  }, [sioUrl, sioPath]);

  // Optional: ping Export API (giữ nguyên)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(exportUrl, {
          method: "POST",
          headers: {
            "content-type": "text/plain; charset=utf-8",
            accept: "application/json, text/plain;q=0.9, */*;q=0.5",
          },
          body: "ping",
        });
        if (res.ok) {
          const ct = res.headers.get("content-type") || "";
          if (ct.startsWith("text/")) {
            const t = await res.text();
            setRaw(t);
          } else {
            setRaw(`Đã kết nối API Export (content-type: ${ct})`);
          }
        } else {
          setRaw(`Export API HTTP ${res.status}`);
        }
      } catch (e) {
        setRaw(String(e));
      }
    })();
  }, [exportUrl]);

  // ====== Render ======
  return (
    <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", background: "var(--bg)", color: "#eaf0ff" }}>
      <div className="wrap">
        <h1>
          Văn GPT
          <span id="serverState" className={`pill${isOk ? "" : " err"}`} style={{ marginLeft: 8 }}>
            {isOk ? "ready" : "error"}
          </span>
        </h1>

        {/* Chat khung */}
        <section className="card chat-panel" id="chat">
          {chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`} data-id={m.id || undefined}>
              {m.text}
            </div>
          ))}
        </section>

        {/* Form điều khiển */}
        <section className="card toolbar">
          <div className="col">
            <label htmlFor="prompt">Nội dung (prompt) — Enter để gửi, Shift+Enter xuống dòng</label>
            <textarea
              id="prompt"
              placeholder="Viết 3 bữa ăn healthy dạng markdown."
              value={prompt}
              disabled={loading}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
          </div>

          <div className="row">
            <div className="col" style={{ flex: 2 }}>
              <label htmlFor="anchors">Anchors (cho get_last_after, phân tách bằng dấu “|”)</label>
              <input
                id="anchors"
                type="text"
                value={anchors}
                disabled={loading}
                onChange={(e) => setAnchors(e.target.value)}
              />
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label htmlFor="reqId">Request ID (tùy chọn)</label>
              <input
                id="reqId"
                type="text"
                placeholder="vd: job-001"
                value={reqId}
                disabled={loading}
                onChange={(e) => setReqId(e.target.value)}
              />
            </div>
          </div>

          <div className="row">
            <button id="btnSend" className="btn" disabled={loading} onClick={onSend}>Gửi</button>
            <button id="btnGetLast" className="btn secondary" disabled={loading} onClick={onGetLast}>Lấy kết quả</button>
            <button id="btnPdf" className="btn ghost" title="Gửi text và tải về PDF" disabled={loading} onClick={onPdfDownload}>PDF download</button>
            <div id="status" className="status" style={{ marginLeft: 12 }}>{status}</div>
          </div>

          <div className="col">
            <div className="meta">Phản hồi thô:</div>
            <pre id="raw" className="json">{raw}</pre>
          </div>
        </section>

        <footer>Server mặc định: <code>{apiUrl}</code></footer>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Container,
  Box,
  Stack,
} from "@mui/material";

import theme from "./theme";
import HeaderBar from "./components/HeaderBar";
import ChatPanel from "./components/ChatPanel";
import Toolbar from "./components/Toolbar";
import useSocketIO from "./hooks/useSocketIO";
import { triggerDownload, safeFilename } from "./utils/download";
import ProgressDialog from "./components/ProgressDialog";
import useFakeProgress from "./hooks/useFakeProgress";

// ====== Constants ======
const DEFAULT_API = "http://localhost:8787/push";
const DEFAULT_SIO = "http://localhost:8787";
const DEFAULT_SIO_PATH = "/ws";
const DEFAULT_GAS_EXPORT =
  "https://script.google.com/macros/s/AKfycbyS3h4Ci958a33mz2tWopo02R1jwQvZaUQrezmT6AzsaqkCc0NkLm4CxPJU_o2lklZo/exec";

export default function App({
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
  const [progressOpen, setProgressOpen] = useState(false);

  // ====== Runtime refs ======
  const currentIdRef = useRef("");
  const lastMsgByIdRef = useRef({});
  const seenRef = useRef(new Set()); // de-dupe displayed push_result events

  const isOk = status === "ready" || status.startsWith("SIO connected");
  const showStatus = useCallback((text, ok = true) => setStatus(ok ? text || "ready" : text || "error"), []);
  const setCurrentId = (id) => (currentIdRef.current = id || "");

  const collectChatAsText = () => chat.map((m) => `${m.role}: ${m.text}`).join("\n");
  const addMsg = (role, text, id) => setChat((prev) => [...prev, { role, text, id }]);
  const replaceBotMsgById = (id, text) => {
    setChat((prev) => {
      const filtered = prev.filter((m) => !(m.role === "bot" && m.id === id));
      return [...filtered, { role: "bot", text, id }];
    });
  };

  const progress = useFakeProgress({
    onDone: () => {
      setProgressOpen(false);
      progress.reset(); // về 0 để lần sau dùng lại
    },
    ceiling: 90,   // tối đa tự chạy đến 90%
    tickMs: 120,   // 120ms/tick
  });

  // ====== HTTP push helper ======
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
    await callPush(payload);
  };

  const onGetLast = async () => {
    const id = (reqId || ``).trim() || `last-${Date.now()}`;
    setCurrentId(id);
    const payload = {
      id,
      type: "get_last_after",
      anchors: anchors.split("|").map((s) => s.trim()).filter(Boolean),
    };
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
    setProgressOpen(true);
    progress.start();
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
        const fname = `${safeFilename((reqId || "export").trim() || "export")}-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.pdf`;
        triggerDownload(blob, fname);
        showStatus("Đã tải PDF");
        progress.finish();
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
        const fname = `${safeFilename((reqId || "export").trim() || "export")}-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.pdf`;
        triggerDownload(blob, fname);
        showStatus("Đã tải PDF từ base64");
        progress.finish();
      } else if (data?.pdfUrl) {
        window.open(data.pdfUrl, "_blank", "noopener");
        showStatus("Đã mở link PDF");
        progress.finish();
      } else {
        showStatus("Không tìm thấy pdf_base64/pdfUrl trong phản hồi", false);
        progress.finish();
      }
    } catch (e) {
      showStatus(String(e), false);
      progress.finish();
    } finally {
      setLoading(false);
    }
  };

  // ====== Socket.IO (thay cho WebSocket) ======
  const onPushResult = useCallback((msg) => {
    try {
      lastMsgByIdRef.current[msg.id] = msg;
      // Hiển thị lên panel "Phản hồi thô"
      setRaw(JSON.stringify(lastMsgByIdRef.current[msg.id], null, 2));

      // De-dupe theo id + text
      const key = msg.id + "::" + (msg.text || "");
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      setTimeout(() => seenRef.current.delete(key), 60000);

      if (msg.text) {
        const text = String(msg.text).replace("ChatGPT said", "VanGPT said");
        // Nếu đã có bot message với cùng id thì replace, còn không thì thêm mới
        // Ở đây dùng replace để giữ nguyên UX cũ
        // Nếu muốn “thêm dòng mới” mỗi lần, có thể đổi thành addMsg("bot", text, msg.id)
        // và xóa logic filter trong replaceBotMsgById
        setChat((prev) => {
          const existed = prev.some((m) => m.role === "bot" && m.id === msg.id);
          if (existed) {
            const filtered = prev.filter((m) => !(m.role === "bot" && m.id === msg.id));
            return [...filtered, { role: "bot", text, id: msg.id }];
          }
          return [...prev, { role: "bot", text, id: msg.id }];
        });
      }
    } catch { }
  }, []);

  useSocketIO({
    sioUrl,
    sioPath,
    onStatus: showStatus,
    onPushResult,
  });

  // ====== Render ======
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          bgcolor: "background.default",
        }}
      >
        <Container>
          <Stack spacing={3}>
            <HeaderBar apiUrl={apiUrl} isOk={isOk} />
            <ChatPanel chat={chat} />
            <Toolbar
              loading={loading}
              prompt={prompt}
              setPrompt={setPrompt}
              anchors={anchors}
              setAnchors={setAnchors}
              reqId={reqId}
              setReqId={setReqId}
              onSend={onSend}
              onGetLast={onGetLast}
              onPdfDownload={onPdfDownload}
              status={status}
              raw={raw}
            />
          </Stack>
        </Container>

        <ProgressDialog
          open={progressOpen}
          progress={progress.value}
          note="Nghe nè bạn tôi ơi, vui lòng đứng yên, đừng đi đâu cả. Tôi đang tải File cho bạn đấy!."
        />
      </Box>
    </ThemeProvider>
  );
}

import {
  Box,
  Container,
  CssBaseline,
  Stack,
  ThemeProvider,
  Link as MuiLink,
  Alert,
  Button,
  ButtonGroup,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatPanel from "./components/ChatPanel";
import HeaderBar from "./components/HeaderBar";
import ProgressDialog from "./components/ProgressDialog";
import Toolbar from "./components/Toolbar";
import useFakeProgress from "./hooks/useFakeProgress";
import useSocketIO from "./hooks/useSocketIO";
import theme from "./theme";
import { safeFilename, triggerDownload } from "./utils/download";
import { extractPdfTextFromFile } from "./utils/pdfText";

// ====== Constants ======
// const DEFAULT_API = "http://localhost:8787/push";
// const DEFAULT_SIO = "http://localhost:8787";
const DEFAULT_API = "https://mh-december-international-editors.trycloudflare.com/push";
const DEFAULT_SIO = "https://mh-december-international-editors.trycloudflare.com";
const DEFAULT_SIO_PATH = "/ws";
const DEFAULT_GAS_EXPORT =
  "https://script.google.com/macros/s/AKfycbyS3h4Ci958a33mz2tWopo02R1jwQvZaUQrezmT6AzsaqkCc0NkLm4CxPJU_o2lklZo/exec";

const DEFAULT_MESSAGES_API = "http://localhost:8787/conversations/1/messages";

export default function App({
  apiUrl = DEFAULT_API,
  sioUrl = DEFAULT_SIO,
  sioPath = DEFAULT_SIO_PATH,
  exportUrl = DEFAULT_GAS_EXPORT,
}) {
  // ====== UI State ======
  const [chat, setChat] = useState([]); // [{id?, role: 'me'|'bot', text}]
  const [prompt, setPrompt] = useState("");
  const [anchors, setAnchors] = useState("tôi đã nói|bạn đã nói|chatgpt đã nói|you said");
  const [reqId, setReqId] = useState("");
  const [status, setStatus] = useState("ready");
  const [raw, setRaw] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [docUrl, setDocUrl] = useState("");

  // >>> NEW: files được quản lý ở cha
  const [files, setFiles] = useState([]); // Array<File>

  // ====== Runtime refs ======
  const currentIdRef = useRef("");
  const lastMsgByIdRef = useRef({});
  const seenRef = useRef(new Set());
  const flushTimersRef = useRef(new Map());
  const bufferedTextRef = useRef(new Map());

  const isOk = status === "ready" || status.startsWith("SIO connected");
  const showStatus = useCallback((text, ok = true) => setStatus(ok ? text || "ready" : text || "error"), []);
  const setCurrentId = (id) => (currentIdRef.current = id || "");

  const collectChatAsText = () => chat.map((m) => `${m.role}: ${m.text}`)[chat.length - 1];
  const addMsg = (role, text, id) => setChat((prev) => [...prev, { role, text, id }]);
  // const addMsg = (role, text, id) => setChat([{ role, text, id }]);

  const progress = useFakeProgress({
    onDone: () => {
      setProgressOpen(false);
      progress.reset();
    },
    ceiling: 90,
    tickMs: 120,
  });

  // ====== HTTP push helper (tự động chọn JSON hoặc FormData) ======
  const callPush = async (payload, attachedFiles = []) => {
    setLoading(true);
    try {
      let res;
      if (attachedFiles && attachedFiles.length) {
        // multipart/form-data
        const fd = new FormData();
        fd.append(
          "meta",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
          "meta.json"
        );
        attachedFiles.forEach((f, i) => {
          fd.append("files", f, f.name || `file-${i}`);
        });

        res = await fetch(apiUrl, { method: "POST", body: fd });
      } else {
        // application/json
        res = await fetch(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let body;
      if (ct.includes("application/json")) {
        body = await res.json().catch(() => ({}));
      } else {
        const txt = await res.text().catch(() => "");
        try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
      }

      setRaw(JSON.stringify(body, null, 2));
      if (!res.ok || body?.ok === false) {
        showStatus(body?.error || `HTTP ${res.status}`, false);
        return body || { ok: false };
      } else {
        showStatus("OK");
        return body || { ok: true };
      }
    } catch (e) {
      const err = String(e);
      showStatus(err, false);
      setRaw(JSON.stringify({ error: err }, null, 2));
      return { ok: false, error: err };
    } finally {
      setPrompt("");
      setLoading(false);
    }
  };

  // ====== Actions ======
  const onSend = async () => {
    const id = reqId.trim() || `job-${Date.now()}`;
    setCurrentId(id);

    let attachments_text = [];
    const pdfFiles = files.filter(f => f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf"));

    for (const f of pdfFiles) {
      try {
        const text = await extractPdfTextFromFile(f);
        attachments_text.push({
          filename: f.name,
          mimetype: f.type,
          size: f.size,
          chars: text.length,
          text: text.slice(0, 100000),
        });
      } catch (e) {
        attachments_text.push({ filename: f.name, mimetype: f.type, size: f.size, error: String(e) });
      }
    }

    const payload = { id, type: "ask_block", prompt, attachments_text: attachments_text?.[0]?.text };
    await callPush(payload, []);  // gửi JSON, không gửi file
    setFiles([]);
  };

  const onGetLast = async () => {
    const id = (reqId || ``).trim() || `last-${Date.now()}`;
    setCurrentId(id);
    const payload = {
      id,
      type: "get_last_after",
      anchors: anchors.split("|").map((s) => s.trim()).filter(Boolean),
    };
    await callPush(payload); // không đính kèm file
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

  // =========== 1) PDF Download ===========
  const onPdfDownload = async () => {
    const text = collectChatAsText();
    console.log('check text', text);
    if (!text) {
      addMsg("bot", "Không có nội dung để xuất PDF.");
      return;
    }
    setLoading(true);
    showStatus("Đang tạo xử lý...");
    setProgressOpen(true);
    progress.start();
    try {
      const res = await postText(exportUrl, text);
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        showStatus("Lỗi xuất: " + (errTxt || `HTTP ${res.status}`), false);
        progress.finish();
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
        // Server trả thẳng PDF
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

      // Chỉ xử lý PDF, bỏ qua docxUrl nếu có
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
        showStatus("Không tìm thấy PDF trong phản hồi (pdf_base64/pdfUrl hoặc application/pdf).", false);
        progress.finish();
      }
    } catch (e) {
      showStatus(String(e), false);
      progress.finish();
    } finally {
      setLoading(false);
    }
  };

  // =========== 2) Tạo link Google Docs (DOCX) ===========
  const onCreateDocLink = async () => {
    const text = collectChatAsText();
    if (!text) {
      addMsg("bot", "Không có nội dung để tạo Google Docs link.");
      return;
    }
    setLoading(true);
    showStatus("Đang tạo Google Docs...");
    setProgressOpen(true);
    progress.start();
    try {
      const res = await postText(exportUrl, text);
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        showStatus("Lỗi tạo Docs: " + (errTxt || `HTTP ${res.status}`), false);
        progress.finish();
        return;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let data = null;

      if (ct.includes("application/json")) {
        data = await res.json();
        setRaw(JSON.stringify(data, null, 2));
      } else {
        // Với Google Apps Script đa phần sẽ trả JSON; nếu không, vẫn thử parse
        const txt = await res.text();
        setRaw(txt);
        try { data = JSON.parse(txt); } catch { data = null; }
      }

      if (data?.googleDocUrl) {
        setDocUrl(data.googleDocUrl);
        showStatus("Đã tạo Google Docs. Bấm vào link để mở.");
        progress.finish();
      } else {
        showStatus("Không tìm thấy googleDocUrl trong phản hồi.", false);
        progress.finish();
      }
    } catch (e) {
      showStatus(String(e), false);
      progress.finish();
    } finally {
      setLoading(false);
    }
  };

  const onPushResult = useCallback((msg) => {
    try {
      lastMsgByIdRef.current[msg.id] = msg;
      setRaw(JSON.stringify(lastMsgByIdRef.current[msg.id], null, 2));

      const key = msg.id + "::" + (msg.text || "");
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      setTimeout(() => seenRef.current.delete(key), 60000);

      if (msg.text) {
        const text = String(msg.text).replace("ChatGPT said", "VanGPT said");
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 5 }}>
              <ChatPanel chat={chat.slice(-1)} />
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
                // vẫn giữ để tương thích, nhưng bạn có thể bỏ nếu không dùng
                onPdfDownload={onPdfDownload}
                onCreateDocLink={onCreateDocLink}
                status={status}
                raw={raw}
                // >>> NEW: điều khiển files từ cha
                files={files}
                onFilesChange={setFiles}
                accept="image/*,.pdf"
                multiple={true}
              />
            </Box>

            {/* NEW: Hiển thị link DOCX sau khi progress hoàn tất */}
            {!!docUrl && !progressOpen && (
              <Alert severity="success">
                Tài liệu Google Docs (DOCX) đã sẵn sàng:{" "}
                <MuiLink href={docUrl} target="_blank" rel="noopener">
                  Mở/Tải DOCX
                </MuiLink>
              </Alert>
            )}


          </Stack>
        </Container>

        <ProgressDialog
          open={progressOpen}
          progress={progress.value}
          note="Nghe nè bạn tôi ơi, vui lòng đứng yên, đừng đi đâu cả. Tôi đang tạo File cho bạn đấy!."
        />
      </Box>
    </ThemeProvider>
  );
}

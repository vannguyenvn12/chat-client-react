import {
  Box,
  Container,
  CssBaseline,
  Stack,
  ThemeProvider,
  Link as MuiLink,
  Alert,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";

import ChatPanel from "./components/ChatPanel";
import HeaderBar from "./components/HeaderBar";
import ProgressDialog from "./components/ProgressDialog";
import Toolbar from "./components/Toolbar";
import useFakeProgress from "./hooks/useFakeProgress";
import useSocketIO from "./hooks/useSocketIO";
import theme from "./theme";
import { safeFilename, triggerDownload } from "./utils/download";
import { extractPdfTextFromFile } from "./utils/pdfText";

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
  const [chat, setChat] = useState([]); // [{ id?, role: 'me'|'bot', text }]
  const [prompt, setPrompt] = useState("");
  const [anchors, setAnchors] = useState("tôi đã nói|bạn đã nói|chatgpt đã nói|you said");
  const [reqId, setReqId] = useState("");
  const [status, setStatus] = useState("ready");
  const [raw, setRaw] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [docUrl, setDocUrl] = useState("");

  // Quản lý files ở cha
  const [files, setFiles] = useState([]); // Array<File>

  // Job đang chờ và cờ UI
  const [activeJobId, setActiveJobId] = useState(null);
  const [waitingChat, setWaitingChat] = useState(false);
  const isBusy = useMemo(() => waitingChat || loading, [waitingChat, loading]);

  // ====== Runtime refs ======
  const currentIdRef = useRef("");
  const lastMsgByIdRef = useRef({});
  const seenRef = useRef(new Set());

  // ====== Timers ======
  const inactivityTimerRef = useRef(null); // 10s im lặng kể từ event cuối
  const firstEventTimerRef = useRef(null); // 15s không có event đầu tiên
  const hardCapTimerRef = useRef(null);    // 90s trần cho cả job

  const SILENCE_MS = 10_000;
  const FIRST_EVT_MS = 15_000;
  const HARD_CAP_MS = 90_000;

  const isOk = status === "ready" || status.startsWith("SIO connected");
  const showStatus = useCallback(
    (text, ok = true) => setStatus(ok ? text || "ready" : text || "error"),
    []
  );
  const setCurrentId = (id) => (currentIdRef.current = id || "");

  // Lấy dòng chat cuối cùng để export
  const collectChatAsText = () =>
    chat.length ? `${chat[chat.length - 1].role}: ${chat[chat.length - 1].text}` : "";

  const addMsg = (role, text, id) => setChat((prev) => [...prev, { role, text, id }]);

  const progress = useFakeProgress({
    onDone: () => {
      setProgressOpen(false);
      progress.reset();
    },
    ceiling: 90,
    tickMs: 120,
  });

  // ====== Timer helpers ======
  const clearTimer = (tref) => {
    if (tref.current) {
      clearTimeout(tref.current);
      tref.current = null;
    }
  };
  const clearAllTimers = () => {
    clearTimer(inactivityTimerRef);
    clearTimer(firstEventTimerRef);
    clearTimer(hardCapTimerRef);
  };

  const stopWaiting = (msg = "Đã ngừng chờ.") => {
    clearAllTimers();
    setWaitingChat(false);
    setActiveJobId(null);
    showStatus(msg, false);
  };

  // Reset 10s im lặng từ THỜI ĐIỂM NHẬN EVENT MỚI (của đúng job)
  const armInactivityFromNow = () => {
    clearTimer(inactivityTimerRef);
    inactivityTimerRef.current = setTimeout(() => {
      stopWaiting("Không có dữ liệu mới sau 10 giây. Đã ngừng chờ.");
    }, SILENCE_MS);
  };

  // Sau khi gửi: nếu 15s không có bất kỳ event nào cho job => dừng chờ
  const armFirstEventTimer = () => {
    clearTimer(firstEventTimerRef);
    firstEventTimerRef.current = setTimeout(() => {
      stopWaiting("Không nhận được phản hồi ban đầu sau 15 giây.");
    }, FIRST_EVT_MS);
  };

  // Giới hạn tổng thời gian 90s cho 1 job
  const armHardCapTimer = () => {
    clearTimer(hardCapTimerRef);
    hardCapTimerRef.current = setTimeout(() => {
      stopWaiting("Quá thời gian chờ tối đa (90 giây).");
    }, HARD_CAP_MS);
  };

  // Cleanup timer khi unmount
  useEffect(() => {
    return () => clearAllTimers();
  }, []);

  // ====== HTTP push helper ======
  const callPush = async (payload, attachedFiles = []) => {
    setLoading(true);
    try {
      let res;
      if (attachedFiles && attachedFiles.length) {
        const fd = new FormData();
        fd.append(
          "meta",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
          "meta.json"
        );
        attachedFiles.forEach((f, i) => fd.append("files", f, f.name || `file-${i}`));
        res = await fetch(apiUrl, { method: "POST", body: fd });
      } else {
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
        try {
          body = JSON.parse(txt);
        } catch {
          body = { raw: txt };
        }
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
    setActiveJobId(id);
    setWaitingChat(true);

    // Bật 2 phao an toàn (không arm inactivity ở đây)
    armFirstEventTimer();
    armHardCapTimer();

    // Chuẩn bị attachments_text (PDF -> text)
    let attachments_text = [];
    const pdfFiles = files.filter(
      (f) => f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf")
    );
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
        attachments_text.push({
          filename: f.name,
          mimetype: f.type,
          size: f.size,
          error: String(e),
        });
      }
    }

    const payload = {
      id,
      type: "ask_block",
      prompt,
      attachments_text: attachments_text?.[0]?.text,
    };
    const result = await callPush(payload, []); // gửi JSON, không gửi file
    if (!result?.ok) {
      // HTTP fail => dừng chờ để không bị kẹt
      stopWaiting("Gửi thất bại.");
    }
    setFiles([]);
  };

  // Không đụng waitingChat khi onGetLast để tránh ảnh hưởng job chat
  const onGetLast = async () => {
    const id = (reqId || ``).trim() || `last-${Date.now()}`;
    setCurrentId(id);
    const payload = {
      id,
      type: "get_last_after",
      anchors: anchors
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
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

  // =========== 1) PDF Download ===========
  const onPdfDownload = async () => {
    const text = collectChatAsText();
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
        try {
          data = JSON.parse(txt);
        } catch { }
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
        try {
          data = JSON.parse(txt);
        } catch { }
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
        showStatus(
          "Không tìm thấy PDF trong phản hồi (pdf_base64/pdfUrl hoặc application/pdf).",
          false
        );
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
        const txt = await res.text();
        setRaw(txt);
        try {
          data = JSON.parse(txt);
        } catch {
          data = null;
        }
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

  // ====== Socket handler ======
  const onPushResult = useCallback((msg) => {
    try {
      lastMsgByIdRef.current[msg.id] = msg;
      setRaw(JSON.stringify(lastMsgByIdRef.current[msg.id], null, 2));

      const key = (msg.id || "no-id") + "::" + (msg.text || msg.delta || msg.event || "");
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      setTimeout(() => seenRef.current.delete(key), 60000);

      // Xác định xem event này thuộc job đang chờ không
      const isForActiveJob =
        !!activeJobId &&
        (
          (msg.id && msg.id === activeJobId) ||
          (!msg.id && (msg.text || msg.delta || msg.event))
        );

      // Event kết thúc / hoàn tất cho job đang chờ
      const isFinalForActiveJob =
        !!activeJobId &&
        (msg.final === true || msg.event === "done" || msg.event === "end" || msg.status === "complete") &&
        (!msg.id || msg.id === activeJobId);

      // Event báo lỗi cho job đang chờ
      const isErrorForActiveJob =
        !!activeJobId &&
        (msg.error || msg.level === "error" || msg.event === "error") &&
        (!msg.id || msg.id === activeJobId);

      // Nhận BẤT KỲ event hợp lệ đầu tiên cho job => hủy timer "first event" và reset 10s im lặng
      if (isForActiveJob) {
        clearTimer(firstEventTimerRef);
        armInactivityFromNow();
      }

      // Hoàn tất => dừng chờ
      if (isFinalForActiveJob) {
        stopWaiting("Đã nhận đủ phản hồi.");
      }

      // Lỗi => dừng chờ
      if (isErrorForActiveJob) {
        stopWaiting(typeof msg.error === "string" ? msg.error : "Có lỗi khi xử lý job.");
      }

      // Cập nhật UI chat nếu có text
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
  }, [activeJobId]);

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

            {/* Thanh loading khi đang chờ chat */}
            {waitingChat && (
              <Box>
                <LinearProgress />
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Đang chờ phản hồi chat...
                </Typography>
              </Box>
            )}

            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 5 }}>
              <ChatPanel chat={chat.slice(-1)} />
              <Toolbar
                loading={isBusy} // disable theo cả waitingChat
                prompt={prompt}
                setPrompt={setPrompt}
                anchors={anchors}
                setAnchors={setAnchors}
                reqId={reqId}
                setReqId={setReqId}
                onSend={onSend}
                onGetLast={onGetLast}
                onPdfDownload={onPdfDownload}
                onCreateDocLink={onCreateDocLink}
                status={status}
                raw={raw}
                files={files}
                onFilesChange={setFiles}
                accept="image/*,.pdf"
                multiple={true}
              />
            </Box>

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

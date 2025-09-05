import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// ====== Constants ======
const DEFAULT_API = "http://localhost:8787/push";
const DEFAULT_SIO = "http://localhost:8787";
const DEFAULT_SIO_PATH = "/ws";
const DEFAULT_GAS_EXPORT =
  "https://script.google.com/macros/s/AKfycbyS3h4Ci958a33mz2tWopo02R1jwQvZaUQrezmT6AzsaqkCc0NkLm4CxPJU_o2lklZo/exec";

// ====== MUI ======
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  Divider,
  Stack,
  Grid,
  Card,
  CardContent,
} from "@mui/material";

// Dark theme nhẹ nhàng
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4da3ff" },
    background: { default: "#0b1020", paper: "#121831" },
    success: { main: "#27c093" },
    error: { main: "#ff6b6b" },
  },
  shape: { borderRadius: 12 },
});

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
  const safeFilename = (name) => name.replace(/[^a-z0-9\\-_.]/gi, "_");

  const collectChatAsText = () => chat.map((m) => `${m.role}: ${m.text}`).join("\n");
  const addMsg = (role, text, id) => setChat((prev) => [...prev, { role, text, id }]);
  const replaceBotMsgById = (id, text) => {
    setChat((prev) => {
      const filtered = prev.filter((m) => !(m.role === "bot" && m.id === id));
      return [...filtered, { role: "bot", text, id }];
    });
  };

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
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => showStatus("SIO connected"));
      socket.on("connect_error", (err) =>
        showStatus(`SIO connect_error: ${err?.message || err}`, false)
      );
      socket.on("disconnect", () => showStatus("SIO disconnected", false));

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

      return () => {
        try {
          socket.off("push_result");
          socket.disconnect();
        } catch { }
      };
    } catch (e) {
      showStatus(String(e), false);
    }
  }, [sioUrl, sioPath]);

  // ====== Render (MUI) ======
  // ====== Render (MUI) ======
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
            {/* Header */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h4" fontWeight={700}>
                Văn GPT
              </Typography>
              <Chip
                label={isOk ? "ready" : "error"}
                color={isOk ? "success" : "error"}
                size="small"
                sx={{ ml: 1, fontWeight: 700 }}
              />
              <Box flex={1} />
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                Server: {apiUrl}
              </Typography>
            </Stack>

            {/* Chat panel */}
            <Paper
              elevation={6}
              sx={{
                p: 2,
                height: "60vh",
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack spacing={1.5} flexGrow={1}>
                {chat.map((m, i) => (
                  <Box
                    key={i}
                    sx={{
                      alignSelf: m.role === "me" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                    }}
                  >
                    <Card
                      variant="outlined"
                      sx={{
                        bgcolor:
                          m.role === "me"
                            ? "rgba(33,49,86,.6)"
                            : "rgba(24,38,71,.6)",
                        borderColor: "rgba(255,255,255,0.12)",
                      }}
                    >
                      <CardContent sx={{ py: 1.25 }}>
                        <Typography variant="body2" whiteSpace="pre-wrap">
                          {m.text}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>
                ))}
              </Stack>
            </Paper>

            {/* Toolbar */}
            <Paper elevation={6} sx={{ p: 3 }}>
              {/* Toolbar */}
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5, color: "text.secondary" }}>
                    Nội dung (prompt) — Enter để gửi, Shift+Enter xuống dòng
                  </Typography>
                  <TextField
                    placeholder="Viết 3 bữa ăn healthy dạng markdown."
                    fullWidth
                    multiline
                    minRows={4}
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
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={8}>
                    <TextField
                      label="Anchors (get_last_after, phân tách “|”)"
                      fullWidth
                      value={anchors}
                      disabled={loading}
                      onChange={(e) => setAnchors(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      label="Request ID (tùy chọn)"
                      placeholder="vd: job-001"
                      fullWidth
                      value={reqId}
                      disabled={loading}
                      onChange={(e) => setReqId(e.target.value)}
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={loading}
                    onClick={onSend}
                  >
                    Gửi
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={loading}
                    onClick={onGetLast}
                  >
                    Lấy kết quả
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    disabled={loading}
                    onClick={onPdfDownload}
                  >
                    PDF download
                  </Button>
                  <Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {status}
                  </Typography>
                </Stack>

                <Box>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Phản hồi thô
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      mt: 0.5,
                      p: 1.25,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                      fontSize: 12,
                      color: "#cfe2ff",
                      maxHeight: 220,
                      overflow: "auto",
                      bgcolor: "rgba(15,21,48,.6)",
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {raw}
                    </pre>
                  </Paper>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );

}

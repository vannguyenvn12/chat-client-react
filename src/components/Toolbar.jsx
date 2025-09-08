import {
    Alert,
    Box,
    Button,
    Divider,
    Link as MuiLink,
    Paper,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import * as React from "react";
import InterviewForm from "./InterviewForm";

export default function Toolbar({
    loading,
    prompt,
    setPrompt,
    anchors,
    setAnchors,
    reqId,
    setReqId,
    onSend,
    onGetLast,
    onPdfDownload,
    onCreateDocLink,
    status,
    raw,
    // --- controlled by parent:
    files = [],
    onFilesChange,         // (files: File[])
    accept = "*",
    multiple = true,
    docUrl,
    progressOpen,
    setChat,
    chat
}) {
    const inputRef = React.useRef(null);

    const handleFilePick = (e) => {
        const picked = Array.from(e.target.files || []);
        const next = multiple ? [...files, ...picked] : picked.slice(0, 1);
        onFilesChange?.(next);
        // reset để cho phép chọn lại cùng 1 file
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleRemoveFile = (idx) => {
        const next = files.filter((_, i) => i !== idx);
        onFilesChange?.(next);
    };

    const handleClearAll = () => {
        onFilesChange?.([]);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <Paper elevation={6} sx={{ p: 3, flex: 1 }}>
            <InterviewForm onSend={onSend} setPrompt={setPrompt} files={files} inputRef={inputRef} loading={loading}
                accept={accept}
                multiple={multiple}
                handleFilePick={handleFilePick}
                handleClearAll={handleClearAll}
                handleRemoveFile={handleRemoveFile}
                prompt={prompt}
                chat={chat}
                setChat={setChat}
            />
            <Stack spacing={2}>
                <Box sx={{ opacity: '0' }}>
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
                                onSend(); // onSend đã tự biết lấy files từ cha
                            }
                        }}
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
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {/* <Button variant="contained" disableElevation disabled={loading} onClick={onSend}>
                        Gửi
                    </Button> */}
                    <Button variant="outlined" color="secondary" onClick={onPdfDownload} disabled={loading}>PDF Download</Button>
                    <Button variant="outlined" color="secondary" onClick={onCreateDocLink} disabled={loading}>Google Docs</Button>
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
    );
}

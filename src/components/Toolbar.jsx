import {
    Paper,
    Stack,
    Box,
    Typography,
    TextField,
    Grid,
    Button,
    Divider,
} from "@mui/material";

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
    status,
    raw,
}) {
    return (
        <Paper elevation={6} sx={{ p: 3 }}>
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

                {/* <Grid container spacing={2}>
                    <Grid item xs={8}>
                        <TextField
                            label='Anchors (get_last_after, phân tách “|”)'
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
                </Grid> */}

                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Button variant="contained" disableElevation disabled={loading} onClick={onSend}>
                        Gửi
                    </Button>
                    <Button variant="outlined" disabled={loading} onClick={onGetLast}>
                        Lấy kết quả
                    </Button>
                    <Button variant="outlined" color="secondary" disabled={loading} onClick={onPdfDownload}>
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
    );
}

import { Paper, Stack, Box, Card, CardContent, Typography } from "@mui/material";

export default function ChatPanel({ chat }) {
    return (
        <Paper
            elevation={6}
            sx={{
                p: 2,
                // height: "60vh",
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                height: '100vh',
                flex: 1
            }}
        >
            <Box>Cuộc đời quá ngắn để code</Box>
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
                                bgcolor: m.role === "me" ? "rgba(33,49,86,.6)" : "rgba(24,38,71,.6)",
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
    );
}

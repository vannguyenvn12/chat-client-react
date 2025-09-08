import { Button, Card, CardContent, CardActions, Divider, Tooltip, ThemeProvider, CssBaseline, Box, Container, Typography, Alert } from "@mui/material";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import LockIcon from "@mui/icons-material/Lock";
import { useEffect } from "react";
import theme from "../theme";

export default function BusyScreen({ onRetry }) {
    // Enter để thử lại nhanh
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Enter") onRetry?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onRetry]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                    p: 3,
                    // nền gradient + vệt sáng nhẹ
                    background:
                        "radial-gradient(1200px 600px at 10% 10%, rgba(226,36,55,0.08), transparent 50%), radial-gradient(1000px 500px at 90% 90%, rgba(16,50,117,0.10), transparent 50%), linear-gradient(180deg, #0b1020 0%, #0e1326 100%)",
                }}
            >
                {/* vệt shimmer mờ */}
                <Box
                    sx={{
                        position: "absolute",
                        inset: "-20%",
                        background:
                            "radial-gradient(60% 40% at 50% 50%, rgba(255,255,255,0.06), transparent 60%)",
                        filter: "blur(40px)",
                        animation: "float 9s ease-in-out infinite",
                        "@keyframes float": {
                            "0%,100%": { transform: "translateY(0px)" },
                            "50%": { transform: "translateY(-8px)" },
                        },
                    }}
                />
                <Container maxWidth="sm" sx={{ position: "relative" }}>
                    <Card
                        elevation={12}
                        sx={{
                            borderRadius: 4,
                            overflow: "hidden",
                            backdropFilter: "blur(8px)",
                            background:
                                "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
                            border: "1px solid rgba(255,255,255,0.12)",
                        }}
                    >
                        <Box
                            sx={{
                                px: 3,
                                py: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                background:
                                    "linear-gradient(90deg, rgba(226,36,55,0.18), rgba(226,36,55,0.06))",
                            }}
                        >
                            <LockIcon sx={{ opacity: 0.9 }} />
                            <Typography variant="overline" letterSpacing={1.1}>
                                Chế độ độc quyền đang bật
                            </Typography>
                        </Box>

                        <CardContent sx={{ p: 4, textAlign: "center" }}>
                            {/* <HourglassBottomIcon sx={{ fontSize: 56, mb: 1, opacity: 0.9 }} /> */}
                            <HourglassBottomIcon
                                sx={{
                                    fontSize: 56,
                                    mb: 1,
                                    opacity: 0.9,
                                    animation: "spin 2s linear infinite",
                                    "@keyframes spin": {
                                        "0%": { transform: "rotate(0deg)" },
                                        "100%": { transform: "rotate(360deg)" },
                                    },
                                }}
                            />
                            <Typography variant="h4" fontWeight={800} gutterBottom sx={{
                                fontFamily: "'Poppins', sans-serif",
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                textShadow: "0 2px 8px rgba(0,0,0,0.35)",
                                background: "linear-gradient(90deg,#ff5f6d 0%, #ffc371 50%, #4facfe 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}>
                                Đã có người sử dụng app
                            </Typography>
                            <Typography sx={{ opacity: 0.8, mb: 2 }}>
                                Ứng dụng hiện đang được dùng bởi một người khác. Vui lòng thử lại sau khi họ dùng xong.
                            </Typography>
                            <Alert
                                severity="warning"
                                variant="outlined"
                                sx={{
                                    borderRadius: 2,
                                    borderColor: "rgba(226,36,55,0.45)",
                                    backgroundColor: "rgba(226,36,55,0.08)",
                                }}
                            >
                                Mẹo: Nhấn <strong>Enter</strong> để thử lại nhanh.
                            </Alert>
                        </CardContent>

                        <Divider sx={{ opacity: 0.2 }} />

                        <CardActions sx={{ p: 3, pt: 2, justifyContent: "center", gap: 1.5 }}>
                            <Button
                                size="large"
                                variant="contained"
                                onClick={onRetry}
                                startIcon={<HourglassBottomIcon />}
                                sx={{
                                    borderRadius: 999,
                                    px: 3,
                                }}
                            >
                                Thử lại
                            </Button>
                            <Button
                                size="large"
                                variant="contained"
                                onClick={onRetry}
                                startIcon={<HourglassBottomIcon />}
                                sx={{
                                    borderRadius: 999,
                                    px: 3,
                                }}
                            >
                                Exit All
                            </Button>
                            <Tooltip title="Tải lại trang">
                                <Button
                                    size="large"
                                    variant="text"
                                    onClick={() => window.location.reload()}
                                    sx={{ borderRadius: 999, px: 2 }}
                                >
                                    Tải lại
                                </Button>
                            </Tooltip>
                        </CardActions>
                    </Card>
                </Container>
            </Box>
        </ThemeProvider>
    );
}

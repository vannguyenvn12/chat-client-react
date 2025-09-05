// Dark theme nhẹ nhàng
import { createTheme } from "@mui/material/styles";

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

export default theme;

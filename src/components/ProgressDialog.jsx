import {
    Dialog,
    DialogTitle,
    DialogContent,
    LinearProgress,
    Typography,
    Stack,

} from "@mui/material";

/**
 * Popup loading:
 *  - Không cho đóng bằng click ra ngoài hay ESC
 *  - Hiện % tiến độ + lời nhắc
 */
export default function ProgressDialog({ open, progress = 0, note }) {
    return (
        <Dialog
            open={open}
            disableEscapeKeyDown
            onClose={(_, reason) => {
                // chặn đóng ngoài ý muốn
                if (reason === "backdropClick") return;
            }}
            PaperProps={{ sx: { minWidth: 360, p: 1.5 } }}
        >
            <DialogTitle sx={{ pb: 1 }}>Đứng yên ở đó...</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography variant="h4" sx={{ opacity: 0.8 }}>
                        {note || "Vui lòng đợi một xíu, đừng đi đâu cả nhé!"}
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={Math.max(1, Math.min(100, Math.round(progress)))}
                    />
                    <Typography variant="caption" align="right" sx={{ opacity: 0.8 }}>
                        {Math.max(1, Math.min(100, Math.round(progress)))}%
                    </Typography>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}

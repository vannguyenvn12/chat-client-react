import { Stack, Typography, Chip, Box } from "@mui/material";

export default function HeaderBar({ apiUrl, isOk }) {
    return (
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
    );
}

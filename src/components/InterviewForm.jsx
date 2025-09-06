import React, { useEffect, useState } from "react";
import {
    Box,
    TextField,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
    Button,
    Stack,
    Chip,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { DeleteOutlineRounded, UploadRounded } from "@mui/icons-material";

export default function InterviewForm({ onSend, setPrompt, files, inputRef, loading,
    accept,
    multiple,
    handleFilePick,
    handleClearAll, handleRemoveFile, prompt }) {
    const [formData, setFormData] = useState({
        cn2: "CN2: Xây dựng bộ câu hỏi mới",
        caseNumber: "2025F31234",
        interviewDate: dayjs("2023-12-10"),
        companion: "Không có",
        note: "Không có",
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (newValue) => {
        setFormData((prev) => ({ ...prev, interviewDate: newValue }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log("Form Data:", formData);

        // format ngày dd/MM/yyyy
        const formattedDate = formData.interviewDate
            ? dayjs(formData.interviewDate).format("DD/MM/YYYY")
            : "";

        const textPrompt = `
        ${formData.cn2} 
        Xuất trực tiếp package 
        Case Number: ${formData.caseNumber} 
        Ngày phỏng vấn: ${formattedDate} 
        Ghi chú: ${formData.note}
        `
        setPrompt(textPrompt.trim());
    };

    useEffect(() => {
        if (prompt && !prompt.includes('undefined')) {
            onSend()
        }
    }, [prompt])


    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: "grid", gap: 2, maxWidth: 400, margin: "auto", }}
        >

            {/* Upload */}
            <Button
                variant="outlined"
                startIcon={<UploadRounded />}
                component="label"
                disabled={loading}
                sx={{ mb: 2 }}
            >
                Đính kèm
                <input
                    ref={inputRef}
                    type="file"
                    hidden
                    accept={accept}
                    multiple={multiple}
                    onChange={handleFilePick}
                />
            </Button>

            {files.length > 0 && (
                <Button
                    variant="text"
                    color="error"
                    startIcon={<DeleteOutlineRounded />}
                    onClick={handleClearAll}
                    disabled={loading}
                    sx={{ ml: { xs: 0, sm: 1 } }}
                >
                    Xóa tất cả
                </Button>
            )}

            {/* Danh sách file */}
            {files.length > 0 && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {files.map((f, idx) => (
                        <Chip
                            key={`${f.name}-${idx}`}
                            label={`${f.name} (${(f.size / 1024).toFixed(1)} KB)`}
                            onDelete={() => handleRemoveFile(idx)}
                            variant="outlined"
                        />
                    ))}
                </Box>
            )}

            {/* CN2 */}
            <FormControl fullWidth>


                <Select
                    labelId="cn2-label"
                    name="cn2"
                    value={formData.cn2}
                    onChange={handleChange}
                >
                    <MenuItem value="CN2: Xây dựng bộ câu hỏi mới">CN2: Xây dựng bộ câu hỏi mới</MenuItem>
                    <MenuItem value="option2">Option 2</MenuItem>
                    <MenuItem value="option3">Option 3</MenuItem>
                </Select>
            </FormControl>



            {/* Case Number */}
            <TextField
                label="Case Number"
                name="caseNumber"
                value={formData.caseNumber}
                onChange={handleChange}
                fullWidth
            />

            {/* Ngày phỏng vấn */}
            <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                    label="Ngày phỏng vấn"
                    value={formData.interviewDate}
                    onChange={handleDateChange}
                    renderInput={(params) => <TextField fullWidth {...params} />}
                />
            </LocalizationProvider>

            {/* Người đi cùng */}
            <TextField
                label="Người đi cùng"
                name="companion"
                value={formData.companion}
                onChange={handleChange}
                fullWidth
            />

            {/* Ghi chú */}
            <TextField
                label="Ghi chú"
                name="note"
                value={formData.note}
                onChange={handleChange}
                fullWidth
            />

            <Button type="submit" variant="contained" >
                Submit
            </Button>
        </Box>
    );
}

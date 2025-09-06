import pdfToText from "react-pdftotext";

export async function extractPdfTextFromFile(file) {
    try {
        const text = await pdfToText(file);
        return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    } catch (error) {
        console.error("Failed to extract text from pdf", error);
        return "";
    }
}

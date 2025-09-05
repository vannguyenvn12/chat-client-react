import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

/**
 * Hook quản lý Socket.IO và phát sự kiện push_result lên UI.
 * onStatus: (text: string, ok?: boolean) => void
 * onPushResult: (msg: any) => void
 */
export default function useSocketIO({ sioUrl, sioPath, onStatus, onPushResult }) {
    const socketRef = useRef(null);

    useEffect(() => {
        try {
            const socket = io(sioUrl, { path: sioPath, transports: ["websocket"] });
            socketRef.current = socket;

            socket.on("connect", () => onStatus?.("SIO connected", true));
            socket.on("connect_error", (err) =>
                onStatus?.(`SIO connect_error: ${err?.message || err}`, false)
            );
            socket.on("disconnect", () => onStatus?.("SIO disconnected", false));
            socket.on("push_result", (msg) => onPushResult?.(msg));

            return () => {
                try {
                    socket.off("push_result");
                    socket.disconnect();
                } catch { }
            };
        } catch (e) {
            onStatus?.(String(e), false);
        }
    }, [sioUrl, sioPath, onStatus, onPushResult]);

    return socketRef;
}

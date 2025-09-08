import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export default function useSocketIO({
    sioUrl,
    sioPath,
    onStatus,
    onPushResult,
    onExclusiveAccepted,
    onExclusiveRejected,
    getClientId,
}) {
    const socketRef = useRef(null);

    // giữ callback mới nhất để tránh stale mà không làm re-connect
    const statusRef = useRef(onStatus);
    const pushRef = useRef(onPushResult);
    const acceptRef = useRef(onExclusiveAccepted);
    const rejectRef = useRef(onExclusiveRejected);
    const getIdRef = useRef(getClientId);

    useEffect(() => { statusRef.current = onStatus; }, [onStatus]);
    useEffect(() => { pushRef.current = onPushResult; }, [onPushResult]);
    useEffect(() => { acceptRef.current = onExclusiveAccepted; }, [onExclusiveAccepted]);
    useEffect(() => { rejectRef.current = onExclusiveRejected; }, [onExclusiveRejected]);
    useEffect(() => { getIdRef.current = getClientId; }, [getClientId]);

    useEffect(() => {
        try {
            const socket = io(sioUrl, {
                path: sioPath,
                transports: ["websocket"],
                // optional: tránh log trùng trong StrictMode dev
                // reconnection: true,
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                statusRef.current?.("SIO connected", true);
                const clientId = (getIdRef.current?.() || socket.id);
                socket.emit("exclusive:claim", { clientId });
            });

            socket.on("connect_error", (err) =>
                statusRef.current?.(`SIO connect_error: ${err?.message || err}`, false)
            );

            socket.on("disconnect", (reason) =>
                statusRef.current?.(`SIO disconnected${reason ? `: ${reason}` : ""}`, false)
            );

            socket.on("push_result", (msg) => pushRef.current?.(msg));

            socket.on("exclusive:accept", (payload) => acceptRef.current?.(payload || {}));
            socket.on("exclusive:reject", (payload) => rejectRef.current?.(payload || {}));
            socket.on("exclusive:vacated", () => {
                const clientId = (getIdRef.current?.() || socket.id);
                socket.emit("exclusive:claim", { clientId });
            });

            return () => {
                try {
                    socket.removeAllListeners();
                    socket.disconnect();
                } catch { }
            };
        } catch (e) {
            statusRef.current?.(String(e), false);
        }
    }, [sioUrl, sioPath]);

    return socketRef;
}

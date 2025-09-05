import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tạo progress giả mượt mà:
 * - start(): chạy lên ~90% (không chạm 100% để chờ thật)
 * - finish(): nhảy lên 100% rồi gọi onDone (nếu có)
 * - reset(): về 0
 */
export default function useFakeProgress({ onDone, ceiling = 90, tickMs = 250 } = {}) {
    const [value, setValue] = useState(0);
    const timerRef = useRef(null);

    const clear = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const start = useCallback(() => {
        clear();
        setValue(1);
        timerRef.current = setInterval(() => {
            setValue((v) => {
                // tăng nhanh lúc đầu, chậm dần về sau
                const remain = Math.max(0, ceiling - v);
                const step = Math.max(0.5, Math.min(4, remain * 0.03)); // 0.5 → 4
                const next = Math.min(ceiling, v + step);
                return next;
            });
        }, tickMs);
    }, [ceiling, tickMs]);

    const finish = useCallback((delayMs = 350) => {
        clear();
        // fill lên 100% trong 2–3 khung
        let local = 0;
        const fin = setInterval(() => {
            local++;
            setValue((v) => Math.min(100, v + (100 - v) * 0.5 + 5));
            if (local >= 3) {
                clearInterval(fin);
                setTimeout(() => {
                    onDone?.();
                }, delayMs);
            }
            return;
        }, 80);
    }, [onDone]);

    const reset = useCallback(() => {
        clear();
        setValue(0);
    }, []);

    useEffect(() => () => clear(), []);

    return { value, start, finish, reset };
}

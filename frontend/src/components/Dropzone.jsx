import { useCallback, useRef, useState } from "react";
import { Upload, FileUp, Loader2 } from "lucide-react";
import { parseFile } from "../lib/xrdApi";
import { toast } from "sonner";

export default function Dropzone({ onParsed }) {
    const [drag, setDrag] = useState(false);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);

    const handleFiles = useCallback(
        async (files) => {
            if (!files || files.length === 0) return;
            setBusy(true);
            for (const file of Array.from(files)) {
                try {
                    const data = await parseFile(file);
                    onParsed(data);
                    toast.success(`Loaded "${data.name}" — ${data.points} points`);
                } catch (e) {
                    toast.error(`${file.name}: ${e.response?.data?.detail || e.message}`);
                }
            }
            setBusy(false);
        },
        [onParsed]
    );

    return (
        <div
            data-testid="dropzone"
            onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`dropzone ${
                drag ? "drag" : ""
            } cursor-pointer rounded-xl px-5 py-6 text-center transition-all`}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".xy,.xye,.txt,.dat,.csv,.pks"
                multiple
                hidden
                onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                }}
                data-testid="file-input"
            />
            <div className="flex flex-col items-center gap-2">
                {busy ? (
                    <Loader2 size={22} className="text-[var(--amber)] animate-spin" />
                ) : (
                    <FileUp size={22} className="text-[var(--amber)]" />
                )}
                <div className="text-sm font-semibold text-[var(--ink-0)]">
                    Drop XRD files here
                </div>
                <div className="mono text-[11px] text-[var(--ink-3)]">
                    .xy · .xye · .txt · .csv · .pks · multi-select OK
                </div>
            </div>
        </div>
    );
}

export function UploadButton({ onParsed }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept=".xy,.xye,.txt,.dat,.csv,.pks"
                multiple
                hidden
                onChange={async (e) => {
                    setBusy(true);
                    for (const file of Array.from(e.target.files)) {
                        try {
                            const data = await parseFile(file);
                            onParsed(data);
                            const refNote = data.is_reference ? " · reference" : "";
                            toast.success(
                                `Loaded "${data.name}" · ${data.source_format}${refNote}`
                            );
                        } catch (err) {
                            toast.error(err.response?.data?.detail || err.message);
                        }
                    }
                    setBusy(false);
                    e.target.value = "";
                }}
                data-testid="upload-button-input"
            />
            <button
                data-testid="upload-button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="btn-amber px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Load pattern
            </button>
        </>
    );
}

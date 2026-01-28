import { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';

export interface LogEntry {
    id: string;
    timestamp: string;
    type: 'AUTH' | 'API' | 'DB' | 'BLOCKCHAIN' | 'INFO';
    message: string;
}

export function LogStream() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleLog = (e: CustomEvent<LogEntry>) => {
            setLogs(prev => [...prev.slice(-19), e.detail]); // Keep last 20
        };

        window.addEventListener('mcc-log', handleLog as EventListener);
        // Add initial log
        window.dispatchEvent(new CustomEvent('mcc-log', {
            detail: {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                type: 'INFO',
                message: 'System Monitor Initialized...'
            }
        }));

        return () => window.removeEventListener('mcc-log', handleLog as EventListener);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'AUTH': return 'text-purple-400';
            case 'API': return 'text-blue-400';
            case 'DB': return 'text-yellow-400';
            case 'BLOCKCHAIN': return 'text-green-400';
            default: return 'text-zinc-400';
        }
    };

    return (
        <div className="fixed bottom-0 w-full bg-zinc-950 border-t border-zinc-800 h-32 font-mono text-xs z-40 hidden md:flex flex-col opacity-90">
            <div className="flex items-center gap-2 px-4 py-1 bg-zinc-900 border-b border-zinc-800 text-zinc-500">
                <Terminal className="w-3 h-3" />
                <span>Live Event Stream</span>
                <span className="ml-auto flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Online
                </span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
                {logs.map((log) => (
                    <div key={log.id} className="flex gap-2">
                        <span className="text-zinc-600 shrink-0">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                        <span className={`font-bold shrink-0 w-24 ${getTypeColor(log.type)}`}>[{log.type}]</span>
                        <span className="text-zinc-300 truncate">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Global Logger Helper
export const logEvent = (type: LogEntry['type'], message: string) => {
    const event = new CustomEvent('mcc-log', {
        detail: {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type,
            message
        }
    });
    window.dispatchEvent(event);
};

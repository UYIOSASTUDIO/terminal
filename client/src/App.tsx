import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Split from 'react-split';

import init, { TerminalSystem, CryptoEngine } from './pkg/core_engine';
import { P2PManager } from './p2p';
import { TerminalPane } from './TerminalPane';

const SIGNALING_SERVER = "http://127.0.0.1:3001";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function App() {
    const systemRef = useRef<TerminalSystem | null>(null);
    const cryptoRef = useRef<CryptoEngine | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const p2pRef = useRef<P2PManager | null>(null);

    const [booted, setBooted] = useState(false);
    const [bootLogs, setBootLogs] = useState<string[]>([]);
    const [terminals, setTerminals] = useState<number[]>([1]);
    const [activeTermId, setActiveTermId] = useState(1);

    const addBootLog = (msg: string) => setBootLogs(prev => [...prev, msg]);

    useEffect(() => {
        const bootSequence = async () => {
            // 1. KERNEL LOAD
            addBootLog("\x1b[1;34m[*]\x1b[0m Booting Kernel...");
            await sleep(200);

            try {
                addBootLog("\x1b[1;34m[*]\x1b[0m Loading WebAssembly Module...");
                await init();
                addBootLog("\x1b[1;32m[+]\x1b[0m WASM Module mounted.");
            } catch (e) {
                addBootLog(`\x1b[1;31m[-]\x1b[0m Kernel Panic: ${e}`);
                return;
            }

            // 2. SYSTEM INIT
            systemRef.current = TerminalSystem.new();
            addBootLog("\x1b[1;32m[+]\x1b[0m VFS mounted.");

            cryptoRef.current = CryptoEngine.new();
            addBootLog("\x1b[1;32m[+]\x1b[0m CryptoEngine initialized.");

            const myKey = cryptoRef.current?.get_public_key_as_hex();
            if (myKey) addBootLog(`\x1b[1;32m[+]\x1b[0m Identity: ${myKey.substring(0,16)}...`);

            // 3. NETWORK
            addBootLog(`\x1b[1;34m[*]\x1b[0m Connecting to Uplink...`);
            const socket = io(SIGNALING_SERVER, { transports: ['websocket'] });
            socketRef.current = socket;

            await new Promise<void>(resolve => {
                setTimeout(resolve, 1000);
                socket.on('connect', resolve);
            });

            if(socket.connected) {
                addBootLog("\x1b[1;32m[+]\x1b[0m Uplink established.");
                if (myKey) socket.emit('register', myKey);
            } else {
                addBootLog("\x1b[1;33m[!]\x1b[0m Offline Mode.");
            }

            // 4. P2P MANAGER & LISTENERS
            if (myKey && socket.connected) {
                p2pRef.current = new P2PManager(
                    socket,
                    (encryptedMsg) => {
                        // MESSAGE RECEIVE HANDLER
                        if (cryptoRef.current) {
                            try {
                                const plain = cryptoRef.current.decrypt(encryptedMsg);
                                window.dispatchEvent(new CustomEvent('p2p-message', { detail: plain }));
                            } catch (e) { console.error("Decryption failed", e); }
                        }
                    },
                    (status) => {
                        // Status Updates auch im Terminal anzeigen
                        window.dispatchEvent(new CustomEvent('p2p-message', { detail: `\x1b[33m[NET]\x1b[0m ${status}` }));
                    }
                );

                // --- HIER FEHLTE WAS! FÜGE DIESEN BLOCK HINZU: ---

                // 1. Wenn wir angerufen werden (war schon da)
                socket.on('incoming-connection', (data) => {
                    if (cryptoRef.current) {
                        try {
                            cryptoRef.current.derive_secret(data.from);
                            window.dispatchEvent(new CustomEvent('p2p-message', { detail: "\x1b[32m>>> SECURE HANDSHAKE ACCEPTED <<<\x1b[0m" }));
                        } catch(e) { console.error(e); }
                    }
                    p2pRef.current?.handleIncomingOffer(data.offer, data.from);
                });

                // 2. WICHTIG: Wenn der andere ANTWORTET (Das fehlte!)
                socket.on('connection-accepted', (data) => {
                    // data enthält { from, answer }
                    if (cryptoRef.current) {
                        // Optional: Secret Check erneut validieren
                        window.dispatchEvent(new CustomEvent('p2p-message', { detail: "\x1b[32m>>> LINK ESTABLISHED <<<\x1b[0m" }));
                    }
                    // Die Antwort in WebRTC einspeisen
                    p2pRef.current?.handleAnswer(data.answer);
                });

                // ------------------------------------------------

                socket.on('ice-candidate', (data) => {
                    p2pRef.current?.handleCandidate(data.candidate);
                });
            }

            await sleep(600);
            setBooted(true);
        };

        bootSequence();
    }, []);

    // --- WINDOW ACTIONS ---
    const handleSplit = () => {
        const newId = Math.max(...terminals, 0) + 1;
        setTerminals([...terminals, newId]);
        setActiveTermId(newId);
    };

    const handleClose = (id: number) => {
        if (terminals.length === 1) return;
        const newTerms = terminals.filter(t => t !== id);
        setTerminals(newTerms);
        setActiveTermId(newTerms[newTerms.length - 1]);
    };

    const renderTerm = (id: number) => (
        <TerminalPane
            key={id}
            id={id}
            isActive={id === activeTermId}
            onFocus={() => setActiveTermId(id)}
            systemRef={systemRef}
            cryptoRef={cryptoRef}
            p2pRef={p2pRef}
            onClose={handleClose}
            onSplit={handleSplit}
        />
    );

    // --- RENDER ---

    // 1. BOOT SCREEN
    if (!booted) {
        return (
            <div style={{ background: '#0c0c0c', height: '100vh', padding: '20px', fontFamily: '"Fira Code", monospace', color: '#ccc', overflow: 'hidden' }}>
                {bootLogs.map((log, i) => (
                    <div key={i} style={{marginBottom: '4px'}} dangerouslySetInnerHTML={{
                        __html: log
                            .replace(/\x1b\[1;34m/g, '<span style="color:#3498db">')
                            .replace(/\x1b\[1;32m/g, '<span style="color:#2ecc71">')
                            .replace(/\x1b\[1;33m/g, '<span style="color:#f1c40f">')
                            .replace(/\x1b\[1;31m/g, '<span style="color:#e74c3c">')
                            .replace(/\x1b\[0m/g, '</span>')
                    }} />
                ))}
            </div>
        );
    }

    // Styles for Grid
    const containerStyle = {
        height: '100vh',
        width: '100vw',
        background: '#0c0c0c',
        padding: '10px',
        boxSizing: 'border-box' as const,
        overflow: 'hidden'
    };

    const wrapperStyle = { width: '100%', height: '100%', overflow: 'hidden', background: '#0c0c0c' };

    // 2. GRID LAYOUT
    if (terminals.length <= 3) {
        return (
            <div style={containerStyle}>
                <Split
                    key={`row-${terminals.length}`}
                    className="split"
                    style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
                    sizes={terminals.map(() => 100/terminals.length)}
                    minSize={100}
                    gutterSize={4}
                >
                    {terminals.map(id => (
                        <div key={id} style={wrapperStyle}>
                            {renderTerm(id)}
                        </div>
                    ))}
                </Split>
            </div>
        );
    } else {
        const splitIndex = Math.ceil(terminals.length / 2);
        const topRow = terminals.slice(0, splitIndex);
        const bottomRow = terminals.slice(splitIndex);

        return (
            <div style={containerStyle}>
                <Split
                    key={`col-${terminals.length}`}
                    direction="vertical"
                    className="split-vertical"
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
                    sizes={[50, 50]}
                    gutterSize={4}
                >
                    <div style={wrapperStyle}>
                        <Split
                            key={`top-${topRow.length}`}
                            className="split"
                            style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
                            sizes={topRow.map(() => 100/topRow.length)}
                            gutterSize={4}
                        >
                            {topRow.map(id => <div key={id} style={wrapperStyle}>{renderTerm(id)}</div>)}
                        </Split>
                    </div>
                    <div style={wrapperStyle}>
                        <Split
                            key={`btm-${bottomRow.length}`}
                            className="split"
                            style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
                            sizes={bottomRow.map(() => 100/bottomRow.length)}
                            gutterSize={4}
                        >
                            {bottomRow.map(id => <div key={id} style={wrapperStyle}>{renderTerm(id)}</div>)}
                        </Split>
                    </div>
                </Split>
            </div>
        );
    }
}
export default App;
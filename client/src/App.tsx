import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Split from 'react-split';

import init, { TerminalSystem, CryptoEngine } from './pkg/core_engine';
import { P2PManager } from './p2p';
import { TerminalPane } from './TerminalPane';

const SIGNALING_SERVER = "http://127.0.0.1:3001";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function App() {
    // --- GLOBAL REFS ---
    const systemRef = useRef<TerminalSystem | null>(null);
    const cryptoRef = useRef<CryptoEngine | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const p2pRef = useRef<P2PManager | null>(null);

    // --- STATE ---
    const [booted, setBooted] = useState(false);
    const [bootLogs, setBootLogs] = useState<string[]>([]);
    const [terminals, setTerminals] = useState<number[]>([1]);
    const [activeTermId, setActiveTermId] = useState(1);

    const addBootLog = (msg: string) => setBootLogs(prev => [...prev, msg]);

    useEffect(() => {
        const bootSequence = async () => {
            // 1. BOOT START
            addBootLog("\x1b[1;34m[*]\x1b[0m Booting Kernel...");
            await sleep(300);

            // 2. WASM
            try {
                addBootLog("\x1b[1;34m[*]\x1b[0m Loading WebAssembly Module (core_engine)...");
                await init();
                addBootLog("\x1b[1;32m[+]\x1b[0m WASM Module mounted into memory.");
            } catch (e) {
                addBootLog(`\x1b[1;31m[-]\x1b[0m Kernel Panic: ${e}`);
                return;
            }

            // 3. RUST
            addBootLog("\x1b[1;34m[*]\x1b[0m Initializing Rust Subsystems...");
            systemRef.current = TerminalSystem.new();
            addBootLog("\x1b[1;32m[+]\x1b[0m Virtual Filesystem (vfs) mounted.");

            cryptoRef.current = CryptoEngine.new();
            addBootLog("\x1b[1;32m[+]\x1b[0m CryptoEngine initialized.");

            // 4. IDENTITY
            const myKey = cryptoRef.current?.get_public_key_as_hex();
            if (myKey) addBootLog(`\x1b[1;32m[+]\x1b[0m Identity derived: ${myKey.substring(0,16)}...`);

            // 5. NETWORK
            addBootLog(`\x1b[1;34m[*]\x1b[0m Initiating Uplink to ${SIGNALING_SERVER}...`);
            const socket = io(SIGNALING_SERVER, { transports: ['websocket'] });
            socketRef.current = socket;

            await new Promise<void>(resolve => {
                setTimeout(resolve, 1500);
                socket.on('connect', resolve);
            });

            if(socket.connected) addBootLog("\x1b[1;32m[+]\x1b[0m Uplink established. Channel Secure.");
            else addBootLog("\x1b[1;33m[!]\x1b[0m Connection Timeout. Running Offline.");

            // 6. P2P & EVENTS
            if (myKey && socket.connected) {
                socket.emit('register', myKey);

                p2pRef.current = new P2PManager(
                    socket,
                    (encryptedMsg) => {
                        if (cryptoRef.current) {
                            try {
                                const plain = cryptoRef.current.decrypt(encryptedMsg);
                                window.dispatchEvent(new CustomEvent('p2p-message', { detail: plain }));
                            } catch (e) { console.error("Decryption failed"); }
                        }
                    },
                    (status) => { console.log("NET STATUS:", status); }
                );

                socket.on('incoming-connection', (data) => {
                    if (cryptoRef.current) {
                        try {
                            cryptoRef.current.derive_secret(data.from);
                            window.dispatchEvent(new CustomEvent('p2p-message', { detail: "SECURE CHANNEL ESTABLISHED" }));
                        } catch(e) { console.error(e); }
                    }
                    p2pRef.current?.handleIncomingOffer(data.offer, data.from);
                });

                socket.on('ice-candidate', (data) => {
                    p2pRef.current?.handleCandidate(data.candidate);
                });
            }

            await sleep(500);
            setBooted(true); // BOOT FERTIG -> GRID ANZEIGEN
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

    // Styles
    const containerStyle = {
        height: '100vh',
        width: '100vw',
        background: '#0c0c0c', // Schwarz gegen weiße Balken
        padding: '10px',
        boxSizing: 'border-box' as const,
        overflow: 'hidden' // Keine Scrollbars am Container
    };

    const wrapperStyle = {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0c0c0c' // Schwarz gegen weiße Balken
    };

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
                    gutterSize={4} // HIER: Dünnere Rahmen (4px)
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
                    gutterSize={4} // HIER: Dünnere Rahmen
                >
                    {/* OBEN */}
                    <div style={wrapperStyle}>
                        <Split
                            key={`top-${topRow.length}`}
                            className="split"
                            style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
                            sizes={topRow.map(() => 100/topRow.length)}
                            gutterSize={4}
                        >
                            {topRow.map(id => (
                                <div key={id} style={wrapperStyle}>
                                    {renderTerm(id)}
                                </div>
                            ))}
                        </Split>
                    </div>

                    {/* UNTEN */}
                    <div style={wrapperStyle}>
                        <Split
                            key={`btm-${bottomRow.length}`}
                            className="split"
                            style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
                            sizes={bottomRow.map(() => 100/bottomRow.length)}
                            gutterSize={4}
                        >
                            {bottomRow.map(id => (
                                <div key={id} style={wrapperStyle}>
                                    {renderTerm(id)}
                                </div>
                            ))}
                        </Split>
                    </div>
                </Split>
            </div>
        );
    }
}
export default App;
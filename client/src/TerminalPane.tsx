import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { TerminalSystem, CryptoEngine } from './pkg/core_engine';
import { P2PManager } from './p2p';
import { BOOT_LOGO } from './logo';

interface TerminalPaneProps {
    id: number;
    isActive: boolean;
    onFocus: () => void;
    systemRef: React.MutableRefObject<TerminalSystem | null>;
    cryptoRef: React.MutableRefObject<CryptoEngine | null>;
    p2pRef: React.MutableRefObject<P2PManager | null>;
    onClose: (id: number) => void;
    onSplit: () => void;
}

export function TerminalPane({ id, isActive, onFocus, systemRef, cryptoRef, p2pRef, onClose, onSplit }: TerminalPaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Prompt Helper
    const prompt = (term: Terminal) => {
        term.write(`\r\n\x1b[1;32m┌──(root㉿kali)-[tty${id}]\r\n└─#\x1b[0m `);
    };

    useEffect(() => {
        if (!containerRef.current) return;

        // 1. Terminal Setup
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"Fira Code", monospace',
            fontSize: 13,
            theme: {
                background: '#0c0c0c',
                foreground: isActive ? '#ffffff' : '#888888',
                cursor: isActive ? '#00ff00' : 'transparent',
            },
            allowTransparency: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(containerRef.current);
        termRef.current = term;

        // CRASH FIX: Sicheres Resizing
        // Wir prüfen, ob das Element wirklich Breite hat, bevor wir fit() rufen.
        const safeFit = () => {
            if (containerRef.current && containerRef.current.clientWidth > 0) {
                try {
                    fitAddon.fit();
                } catch (e) {
                    // Ignoriere Fehler, wenn Xterm noch nicht bereit ist
                }
            }
        };

        // Warte kurz, bis das DOM da ist
        setTimeout(safeFit, 10);

        // Resize Observer mit Safety Check
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(safeFit);
        });
        resizeObserver.observe(containerRef.current);

        // 2. Inhalt füllen (Logo Logik)
        if (id === 1) {
            const lines = BOOT_LOGO.split('\n');
            lines.forEach(line => term.writeln(line));
            term.writeln('');
            term.writeln(`\x1b[1;34m[TTY ${id}] Attached to Session.\x1b[0m`);
        } else {
            term.writeln(`\x1b[1;34m[TTY ${id}] Terminal spawned.\x1b[0m`);
        }

        prompt(term);

        // Global Chat Listener
        const handleGlobalMsg = (e: any) => {
            // Lösche die aktuelle Zeile, schreibe Nachricht, dann Prompt neu
            term.write('\x1b[2K\r');
            term.writeln(`\r\n${e.detail}`);
            prompt(term);
        };
        window.addEventListener('p2p-message', handleGlobalMsg);

        // ... (Input Handling wie gehabt) ...
        let currentLine = '';
        term.onData((data) => {
            // ... (Code unverändert lassen) ...
            if (!isActive) onFocus();
            const code = data.charCodeAt(0);
            if (code === 13) {
                term.write('\r\n');
                handleCommand(currentLine.trim(), term);
                currentLine = '';
                prompt(term);
            } else if (code === 127) {
                if (currentLine.length > 0) {
                    term.write('\b \b');
                    currentLine = currentLine.slice(0, -1);
                }
            } else {
                currentLine += data;
                term.write(data);
            }
        });

        const clickHandler = () => onFocus();
        containerRef.current.addEventListener('mousedown', clickHandler);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('p2p-message', handleGlobalMsg);
            containerRef.current?.removeEventListener('mousedown', clickHandler);
            term.dispose();
        };
    }, []);

    // Theme Update
    useEffect(() => {
        if(termRef.current) {
            termRef.current.options.theme = {
                background: '#0c0c0c',
                foreground: isActive ? '#e0e0e0' : '#555555',
                cursor: isActive ? '#00ff00' : 'transparent',
            };
            termRef.current.write('');
        }
    }, [isActive]);

    const handleCommand = (input: string, term: Terminal) => {
        if (!input) return;

        if (input === 'split') { onSplit(); return; }
        if (input === 'exit') { onClose(id); return; }
        if (input === 'clear') { term.clear(); return; }

        if (input === 'session') {
            if (cryptoRef.current) {
                const id = cryptoRef.current.get_public_key_as_hex();
                const check = cryptoRef.current.get_secret_checksum();
                term.writeln(`IDENTITY: ${id}`);
                term.writeln(`SECURE CHECK: [${check}]`);
            }
        }
        else if (input.startsWith('connect ')) {
            const targetId = input.split(' ')[1];
            const myId = cryptoRef.current?.get_public_key_as_hex();
            if(targetId && p2pRef.current && cryptoRef.current && myId) {
                try {
                    cryptoRef.current.derive_secret(targetId);
                    const check = cryptoRef.current.get_secret_checksum();
                    term.writeln(`\x1b[36m[CRYPTO]\x1b[0m Secrets derived. Check: [${check}]`);
                    term.writeln(`\x1b[33m[NET]\x1b[0m Initializing handshake...`);
                    p2pRef.current.initiateConnection(targetId, myId);
                } catch(e) {
                    term.writeln(`\x1b[31m[ERROR]\x1b[0m Invalid Key Format.`);
                }
            }
        }
        else if (input.startsWith('say ')) {
            const message = input.substring(4);
            if(p2pRef.current && cryptoRef.current) {
                try {
                    const cipherText = cryptoRef.current.encrypt(message);
                    p2pRef.current.sendMessage(cipherText);
                    term.writeln(`\x1b[1;35m[YOU]\x1b[0m ${message}`);
                } catch(e) {
                    term.writeln(`\x1b[31m[ERROR]\x1b[0m No secure connection.`);
                }
            }
        }
        else if (systemRef.current) {
            const output = systemRef.current.execute_command(input);
            if(output) term.writeln(output);
        }
    };

    return (
        <div
            ref={containerRef}
            className="terminal-wrapper"
            style={{ width: '100%', height: '100%', overflow: 'hidden' }}
        />
    );
}
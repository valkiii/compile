/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat between the two online players (draft, game and results screens).
 * Messages travel over the same peer-to-peer connection as the game and are kept per room
 * on this device, so they survive a page reload.
 */

import React, { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { RelayClient } from '../multiplayer/relayClient';
import { isOnlineMessage } from '../multiplayer/messages';
import '../styles/layouts/chat.css';

interface ChatMessage {
    id: string;
    text: string;
    at: number;
    mine: boolean;
}

interface OnlineChatProps {
    client: RelayClient;
    room: string;
    /** In a phone game the bubble sits under the top bar instead of the bottom corner. */
    inGame: boolean;
}

const MAX_LENGTH = 300;
const MAX_KEPT = 100;
const QUICK_REPLIES = ['👋 Hi!', 'Good luck!', 'Nice move!', 'Ouch 😅', 'Thinking…', 'One sec', 'GG!', 'Rematch?'];

const storageKey = (room: string) => `compile_chat_${room}`;

function loadMessages(room: string): ChatMessage[] {
    try {
        return JSON.parse(localStorage.getItem(storageKey(room)) || '[]');
    } catch {
        return [];
    }
}

function saveMessages(room: string, messages: ChatMessage[]) {
    try {
        localStorage.setItem(storageKey(room), JSON.stringify(messages.slice(-MAX_KEPT)));
    } catch {
        // ignore
    }
}

const timeLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const OnlineChat: React.FC<OnlineChatProps> = ({ client, room, inGame }) => {
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(room));
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [draft, setDraft] = useState('');
    const [preview, setPreview] = useState<ChatMessage | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => saveMessages(room, messages), [room, messages]);

    // Incoming messages
    useEffect(() => client.on(event => {
        if (event.type !== 'message' || !isOnlineMessage(event.data) || event.data.k !== 'chat') return;
        const { id, text, at } = event.data;
        const message: ChatMessage = { id, text: String(text).slice(0, MAX_LENGTH), at, mine: false };
        setMessages(prev => (prev.some(m => m.id === id) ? prev : [...prev, message]));
        if (!openRef.current) {
            setUnread(n => n + 1);
            setPreview(message);
        }
    }), [client]);

    // Short preview bubble for messages that arrive while the chat is closed
    useEffect(() => {
        if (!preview) return;
        const t = setTimeout(() => setPreview(null), 4500);
        return () => clearTimeout(t);
    }, [preview]);

    useEffect(() => {
        if (open) {
            setUnread(0);
            setPreview(null);
        }
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [open, messages.length]);

    const send = (raw: string) => {
        const text = raw.trim().slice(0, MAX_LENGTH);
        if (!text) return;
        const message: ChatMessage = { id: uuidv4(), text, at: Date.now(), mine: true };
        client.send({ k: 'chat', id: message.id, text: message.text, at: message.at });
        setMessages(prev => [...prev, message]);
        setDraft('');
    };

    return (
        <div className={`online-chat ${inGame ? 'in-game' : ''}`}>
            {!open && (
                <button className="chat-bubble-button" onClick={() => setOpen(true)} aria-label={`Chat${unread ? `, ${unread} new` : ''}`}>
                    💬
                    {unread > 0 && <span className="chat-unread">{unread > 9 ? '9+' : unread}</span>}
                </button>
            )}
            {!open && preview && (
                <button className="chat-preview" onClick={() => setOpen(true)}>
                    <span className="chat-preview-label">Rival</span>
                    {preview.text}
                </button>
            )}
            {open && (
                <div className="chat-panel" role="dialog" aria-label="Chat with your rival">
                    <div className="chat-header">
                        <span>Chat with your rival</span>
                        <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
                    </div>
                    <div className="chat-list" ref={listRef}>
                        {messages.length === 0 && <p className="chat-empty">Say hi! Messages go straight to your rival.</p>}
                        {messages.map(m => (
                            <div key={m.id} className={`chat-message ${m.mine ? 'mine' : 'theirs'}`}>
                                <span className="chat-text">{m.text}</span>
                                <span className="chat-time">{timeLabel(m.at)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="chat-quick">
                        {QUICK_REPLIES.map(q => (
                            <button key={q} onClick={() => send(q)}>{q}</button>
                        ))}
                    </div>
                    <form
                        className="chat-input-row"
                        onSubmit={e => {
                            e.preventDefault();
                            send(draft);
                        }}
                    >
                        <input
                            value={draft}
                            maxLength={MAX_LENGTH}
                            placeholder="Message"
                            enterKeyHint="send"
                            onChange={e => setDraft(e.target.value)}
                        />
                        <button type="submit" className="btn" disabled={!draft.trim()}>Send</button>
                    </form>
                </div>
            )}
        </div>
    );
};

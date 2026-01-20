# ElevenLabs WebRTC Voice Demo

A complete, minimal implementation of a custom UI for ElevenLabs Conversational AI using WebRTC - **without** the embed widget.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER                                     │
│  ┌─────────────────┐        ┌─────────────────────────────────────┐ │
│  │  User Interface │        │  ElevenLabsWebRTCClient            │ │
│  │  (HTML/React)   │──────▶│  - Manages WebRTC connection       │ │
│  │                 │        │  - Handles audio streams           │ │
│  │  [Start] [Stop] │        │  - Processes transcripts           │ │
│  └─────────────────┘        └──────────────┬──────────────────────┘ │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
                          1. Request token   │
                             (agent_id)      │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR BACKEND                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  POST /api/elevenlabs-webrtc/token                              ││
│  │                                                                  ││
│  │  - Validates request                                             ││
│  │  - Uses ELEVENLABS_API_KEY (never exposed to browser)           ││
│  │  - Calls ElevenLabs API to get signed URL                       ││
│  │  - Returns short-lived WebSocket URL (~60 seconds)              ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                             │
                          2. Request signed  │
                             WebSocket URL   │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ELEVENLABS API                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  POST /v1/convai/conversation/get_signed_url                    ││
│  │                                                                  ││
│  │  Returns: { signed_url: "wss://api.elevenlabs.io/..." }         ││
│  │  - Valid for ~60 seconds                                         ││
│  │  - One-time use                                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                             │
                          3. WebSocket +     │
                             WebRTC setup    │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ELEVENLABS WEBRTC                                │
│                                                                      │
│  Browser ◀════════════════════════════════════════════▶ ElevenLabs  │
│          │            Direct audio stream             │              │
│          │            (Low latency)                   │              │
│          │                                            │              │
│          └── User's voice ──────────────────────────▶│              │
│          ◀── Agent's voice ─────────────────────────── │              │
│          ◀── Transcript updates ───────────────────── │              │
└─────────────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
public/elevenlabs-webrtc-demo/
├── index.html                    # Standalone HTML demo page
├── elevenlabs-webrtc-client.js   # WebRTC client class (vanilla JS)
├── VoiceChat.jsx                 # React component
└── README.md                     # This file

src/routes/
└── elevenlabs-webrtc.js          # Backend token endpoint
```

## Quick Start

### 1. Prerequisites

- ElevenLabs account with API key
- An ElevenLabs Conversational AI Agent (get the agent ID)
- Node.js backend running

### 2. Environment Setup

Add to your `.env` file:

```bash
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

### 3. Access the Demo

Start your server and navigate to:

```
http://localhost:3000/elevenlabs-webrtc-demo/
```

### 4. Test the Connection

1. Enter your ElevenLabs Agent ID
2. Click "Start Talking"
3. Allow microphone access when prompted
4. Start speaking - the agent will respond!

## Files Explained

### Backend: `/src/routes/elevenlabs-webrtc.js`

**Purpose:** Secure token generation endpoint

**Key Points:**
- API key is NEVER sent to the browser
- Generates short-lived signed URLs (~60 seconds)
- Supports dynamic variables for agent personalization

**Endpoint:**
```
POST /api/elevenlabs-webrtc/token

Request:
{
  "agent_id": "your-agent-id",
  "conversation_initiation_data": {
    "dynamic_variables": {
      "customer_name": "John"
    }
  }
}

Response:
{
  "success": true,
  "signed_url": "wss://api.elevenlabs.io/...",
  "agent_id": "your-agent-id"
}
```

### Client: `elevenlabs-webrtc-client.js`

**Purpose:** Manages the entire WebRTC connection lifecycle

**Key Methods:**
- `connect()` - Start the voice conversation
- `disconnect()` - End the conversation
- `sendText(text)` - Send text input (optional)
- `getStatus()` - Get current connection status
- `getTranscript()` - Get full transcript history

**Callbacks:**
- `onStatusChange(status)` - 'disconnected', 'connecting', 'connected', 'error'
- `onTranscript(role, text, isFinal)` - Real-time transcript updates
- `onError(error)` - Error handling
- `onAudioLevel(level)` - Audio volume (0-1)

**Usage:**
```javascript
const client = new ElevenLabsWebRTCClient({
  tokenEndpoint: '/api/elevenlabs-webrtc/token',
  agentId: 'your-agent-id',
  dynamicVariables: { customer_name: 'John' },
  onTranscript: (role, text, isFinal) => {
    console.log(`${role}: ${text}`);
  },
  onStatusChange: (status) => {
    console.log('Status:', status);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Start conversation
await client.connect();

// Later, end conversation
client.disconnect();
```

### React Component: `VoiceChat.jsx`

**Purpose:** Ready-to-use React component

**Props:**
- `agentId` (required) - ElevenLabs agent ID
- `tokenEndpoint` - Backend endpoint (default: '/api/elevenlabs-webrtc/token')
- `dynamicVariables` - Variables to pass to agent
- `title` - Display title
- `subtitle` - Display subtitle

**Usage with React:**
```jsx
import VoiceChat from './VoiceChat';

function App() {
  return (
    <VoiceChat
      agentId="your-elevenlabs-agent-id"
      dynamicVariables={{ customer_name: 'John' }}
    />
  );
}
```

## WebRTC Connection Flow

1. **Get Microphone Access**
   ```javascript
   navigator.mediaDevices.getUserMedia({ audio: true })
   ```

2. **Request Signed URL**
   ```javascript
   fetch('/api/elevenlabs-webrtc/token', {
     method: 'POST',
     body: JSON.stringify({ agent_id: 'xxx' })
   })
   ```

3. **Create RTCPeerConnection**
   ```javascript
   const pc = new RTCPeerConnection({
     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
   });
   ```

4. **Add Local Audio Track**
   ```javascript
   stream.getAudioTracks().forEach(track => {
     pc.addTrack(track, stream);
   });
   ```

5. **Connect WebSocket**
   ```javascript
   const ws = new WebSocket(signedUrl);
   ```

6. **Handle SDP Exchange**
   ```javascript
   // Receive offer from ElevenLabs
   await pc.setRemoteDescription({ type: 'offer', sdp: offer });

   // Create and send answer
   const answer = await pc.createAnswer();
   await pc.setLocalDescription(answer);
   ws.send(JSON.stringify({ type: 'sdp', sdp: answer.sdp }));
   ```

7. **Handle Audio & Transcripts**
   ```javascript
   pc.ontrack = (event) => {
     audioElement.srcObject = event.streams[0];
   };

   ws.onmessage = (event) => {
     const msg = JSON.parse(event.data);
     if (msg.type === 'user_transcript') {
       // User's speech
     } else if (msg.type === 'agent_response') {
       // Agent's response
     }
   };
   ```

## Error Handling

The client handles common errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "Microphone permission denied" | User blocked mic access | Show permission instructions |
| "No microphone found" | No audio input device | Prompt user to connect mic |
| "Failed to get conversation token" | Backend/API error | Check API key & agent ID |
| "WebSocket connection failed" | Network issue | Retry connection |

## Security Considerations

1. **API Key Protection**
   - Never expose `ELEVENLABS_API_KEY` to the browser
   - Backend generates tokens, browser only receives signed URLs

2. **Token Lifetime**
   - Signed URLs expire in ~60 seconds
   - Tokens are single-use

3. **Rate Limiting**
   - Consider adding rate limiting to `/api/elevenlabs-webrtc/token`
   - Prevent abuse of token generation

## Testing Checklist

- [ ] Backend health check: `GET /api/elevenlabs-webrtc/health`
- [ ] Token generation works with valid agent ID
- [ ] Microphone permission prompt appears
- [ ] WebRTC connection establishes successfully
- [ ] User's speech is transcribed
- [ ] Agent responds with voice
- [ ] Transcript displays in real-time
- [ ] Disconnect cleanly ends the session
- [ ] Errors are handled gracefully

## Troubleshooting

**No audio from agent:**
- Check browser console for WebRTC errors
- Ensure audio element is not muted
- Verify agent is configured correctly in ElevenLabs

**Microphone not working:**
- Check browser permissions
- Try a different browser
- Ensure mic is selected in system settings

**Connection fails immediately:**
- Verify ELEVENLABS_API_KEY is set
- Check agent ID is correct
- Review server logs for API errors

**Transcript not appearing:**
- Check WebSocket message handling
- Verify transcript message types match ElevenLabs format

## Production Considerations

For production use, consider:

1. **Authentication**: Add user authentication to token endpoint
2. **Rate Limiting**: Prevent token abuse
3. **Logging**: Track conversations for analytics
4. **Error Monitoring**: Add Sentry or similar
5. **HTTPS**: Required for getUserMedia in most browsers
6. **Mobile Support**: Test on iOS Safari and Android Chrome

## License

MIT - Feel free to use and modify for your projects.

# Voice Notes Web App

Implementation of a user-friendly interface where users can record their voice, view their live transcription, edit their transcription, and copy or clear it as needed.

![Example](example.gif)

## Task Details

### Implementation Checklist

- [ ] **Stream Audio:** Streams the recorded audio to the server for real-time transcription using WebSocket (Socket.IO) library.
- [ ] **Live Transcription:** Implements real-time transcription of the user's voice using Deepgram Transcription API.
- [ ] **Display Transcription:** Displays the live transcription in a text area, allowing the user to see what they are saying in real-time.
- [ ] **Edit Transcription:** Allows the user to manually edit the transcription in the text area.
- [ ] **Copy Transcription:** Adds a copy button that allows the user to easily copy the transcription to the clipboard.
- [ ] **Clear Transcription:** Adds a clear button that resets the transcription and clears the text area.

### Transcription API Integration

- The web app integrates with Deepgram Transcription API to perform real-time transcription of the user's voice.
- The server-side implementation handles the communication with the transcription API, including sending the audio stream and receiving transcription events.
- The client-side implementation displays the transcription events in real-time as they are received from the server.

### Audio Streaming with WebSocket (Socket.IO)

- Uses the WebSocket (Socket.IO) library to establish a real-time bidirectional communication channel between the client and the server.
- Utilizes the WebSocket connection to stream the recorded audio from the client to the server in real-time.
- The server receives the audio stream and forward it to the transcription API for real-time transcription.

## Setup

- Clone the repository.
- Navigate to the client directory and run the following commands:
  ```
  cd client
  npm install
  npm run dev
  ```
- In a separate terminal window, navigate to the server directory and run the following commands:
  ```
  cd server
  npm install
  npm run dev
  ```

### Server-side Implementation

- Implements the server-side logic to handle the WebSocket connection and audio streaming.
- Uses the Socket.IO library to establish a WebSocket connection between the client and the server.
- Receives the audio stream from the client via the WebSocket connection and sends it to the transcription API for real-time transcription.
- Subscribes to the transcription events provided by the API and emits them to the client via the WebSocket connection.

### Client-side Implementation

- Utilizes the provided `useAudioRecorder` file to handle audio recording events.
- Implements the client-side logic to establish a WebSocket connection with the server using the Socket.IO library.
- Streams the recorded audio to the server via the WebSocket connection in real-time.
- Listens for transcription events emitted by the server:
  - Displays the interim transcription results in the text area as they are received, allowing the user to see the real-time transcription progress.
  - When the final transcription results are received, replaces the interim results in the text area with the final transcription.
- Allows the user to manually edit the transcription in the text area.
- Implements a copy button that allows the user to easily copy the transcription to the clipboard.
- Adds a clear button that resets the transcription and clears the text area.

## Automatic Testing

To facilitate testing of the web app, please make sure to add the following IDs to the corresponding UI components:

- Record Button: Add the ID `record-button` to the button element that starts and stops the audio recording.
  Example: `<button id="record-button">Record</button>`

- Transcription Display: Add the ID `transcription-display` to the element that displays the real-time transcription.
  Example: `<textarea id="transcription-display"></textarea>`

- Copy Button: Add the ID `copy-button` to the button element that copies the transcription to the clipboard.
  Example: `<button id="copy-button">Copy</button>`

- Clear Button: Add the ID `reset-button` to the button element that clears the transcription.
  Example: `<button id="reset-button">Clear</button>`

By adding these IDs to the respective UI components, the provided test suite will be able to locate and interact with the elements correctly.


## Resources

- Socket IO documentation: https://socket.io/docs/v4/
- Socket IO client sdk: https://www.npmjs.com/package/socket.io-client
- Socket IO server sdk: https://www.npmjs.com/package/socket.io-client
- Deepgram documentation: https://developers.deepgram.com/docs/node-sdk-streaming-transcription
- Deepgram sdk: https://www.npmjs.com/package/@deepgram/sdk
- Deepgram signup (for free API key): https://console.deepgram.com/signup

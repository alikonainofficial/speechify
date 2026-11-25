import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const serverURL = "http://localhost:8080";

const subscriptions = ["final", "partial", "transcriber-ready", "error"];

const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const isInitialized = useRef(false);
  
  const initialize = () => {
    if(!isInitialized.current){
      const newSocket = io(serverURL, {
        transports: ["websocket"],
        upgrade: false,
      });
  
      subscriptions.forEach((event) => {
        newSocket.on(event, (data) => {
          console.log(`Event: ${event}`, data);
        });
      });
  
      setSocket(newSocket);
      isInitialized.current = true;
    }
  };

  const disconnect = () => {
    if(socket){
      socket.disconnect();
      setSocket(null);
      isInitialized.current = false;
    }
  };

  useEffect(() => {
    return () => {
      if(socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  return { socket, initialize, disconnect };
};

export default useSocket;

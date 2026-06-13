import React, { createContext, useContext, useCallback, useState } from "react";

// Holds per-inspection defect-chat history ABOVE the tab-switching boundary in
// App.jsx (which remounts views via `key={active}`), so each defect's conversation
// survives navigating away and back instead of resetting on remount.
const DefectChatContext = createContext(null);

export function DefectChatProvider({ children }) {
  const [chats, setChats] = useState({}); // { [inspectionId]: msgs[] }

  const getChat = useCallback((id) => (id && chats[id]) || [], [chats]);

  // setChat(id, msgs) or setChat(id, prevMsgs => nextMsgs)
  const setChat = useCallback((id, updater) => {
    if (!id) return;
    setChats(prev => {
      const cur = prev[id] || [];
      const next = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [id]: next };
    });
  }, []);

  return (
    <DefectChatContext.Provider value={{ getChat, setChat }}>
      {children}
    </DefectChatContext.Provider>
  );
}

export function useDefectChat() {
  return useContext(DefectChatContext);
}

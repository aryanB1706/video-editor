import { createContext, useContext, useState } from "react";

const VideoContext = createContext(null);

export function VideoProvider({ children }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const setVideo = (file) => {
    setVideoFile(file);
    if (file) setVideoUrl(URL.createObjectURL(file));
    else setVideoUrl(null);
  };

  return (
    <VideoContext.Provider value={{ videoFile, videoUrl, setVideo }}>
      {children}
    </VideoContext.Provider>
  );
}

export function useVideoStore() {
  const ctx = useContext(VideoContext);
  if (!ctx) throw new Error("useVideoStore must be used within VideoProvider");
  return ctx;
}

import { BrowserRouter, Routes, Route } from "react-router-dom";
import MobileLayout from "./components/MobileLayout";
import Upload from "./pages/Upload";
import Editor from "./pages/Editor";
import Preview from "./pages/Preview";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MobileLayout />}>
          <Route path="/" element={<Upload />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/preview" element={<Preview />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

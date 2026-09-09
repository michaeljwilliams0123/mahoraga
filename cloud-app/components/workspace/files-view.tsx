import { FileUp, FolderOpen, MessageCircle, Paperclip, Trash2 } from "lucide-react";
import type { FilesViewProps } from "./workspace-types";

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

export function FilesView({ files, totalBytes, fileInput, addFiles, setFiles, onBackToChat }: FilesViewProps) {
  return (
    <section className="one-view" aria-label="Files">
      <div className="one-view-heading">
        <div>
          <span className="one-kicker">Files & artifacts</span>
          <h1>Your working shelf</h1>
          <p>Stage source files here. Mahoraga-produced artifacts will appear in the same shelf when the core artifact bridge returns them.</p>
        </div>
        <button className="soft-button" type="button" onClick={() => fileInput.current?.click()}><FileUp size={16} /> Add files</button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      {files.length === 0 ? (
        <button className="file-drop-card" type="button" onClick={() => fileInput.current?.click()}>
          <FolderOpen size={28} />
          <strong>Drop into the conversation, or choose files here.</strong>
          <span>Files stay local until the bounded core artifact bridge accepts them.</span>
        </button>
      ) : (
        <div className="file-shelf">
          {files.map((file) => (
            <article key={`${file.name}-${file.size}-${file.lastModified}`}>
              <div className="file-icon"><Paperclip size={18} /></div>
              <div><strong>{file.name}</strong><span>{readableBytes(file.size)}</span></div>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
      )}

      <div className="file-summary">
        <span>{files.length} staged</span><span>{readableBytes(totalBytes)}</span><span>core bridge required to send</span>
      </div>
      <button className="text-button" type="button" onClick={onBackToChat}><MessageCircle size={16} /> Continue in chat</button>
    </section>
  );
}

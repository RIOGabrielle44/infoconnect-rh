
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const BUCKET = "publication-files";
const COLORS = ["#2563eb", "#059669", "#ea580c", "#7c3aed", "#db2777", "#0f766e", "#475569"];
const formatEmoji = { PDF: "📄", Vidéo: "🎬", Audio: "🎧", Image: "🖼️", Texte: "📣", Questionnaire: "📊" };
const formats = Object.keys(formatEmoji);

function slugify(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `canal-${Date.now()}`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activeChannel, setActiveChannel] = useState("tous");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [authForm, setAuthForm] = useState({ email: "", password: "", fullName: "" });
  const [authMode, setAuthMode] = useState("signin");
  const [composerOpen, setComposerOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [file, setFile] = useState(null);
  const [channelForm, setChannelForm] = useState({ title: "", description: "", color: COLORS[0] });
  const [postForm, setPostForm] = useState({
    channel_id: "",
    title: "",
    body: "",
    format: "Texte",
    pinned: false,
    poll_question: "",
    poll_options: "Oui\nNon\nJe ne sais pas encore",
  });

  const isAdmin = profile?.role === "admin";
  const selectedPost = posts.find((post) => post.id === selectedId) || posts[0];
  const selectedChannel = channels.find((channel) => channel.id === selectedPost?.channel_id);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setChannels([]);
      setPosts([]);
      return;
    }
    loadProfile();
    loadData();
    const channel = supabase
      .channel("infoconnect-rh-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id]);

  async function loadProfile() {
    const { data, error } = await supabase.from("profiles").select("id, full_name, role").eq("id", session.user.id).single();
    if (!error) setProfile(data);
  }

  async function loadData() {
    setLoading(true);
    const [{ data: channelData, error: channelError }, { data: postData, error: postError }] = await Promise.all([
      supabase.from("channels").select("*").order("created_at", { ascending: true }),
      supabase.from("posts_with_stats").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (channelError || postError) notify(channelError?.message || postError?.message || "Erreur de chargement");
    setChannels(channelData || []);
    setPosts(postData || []);
    if (!selectedId && postData?.length) setSelectedId(postData[0].id);
    if (!postForm.channel_id && channelData?.length) setPostForm((current) => ({ ...current, channel_id: channelData[0].id }));
    setLoading(false);
  }

  const visiblePosts = useMemo(() => posts
    .filter((post) => activeChannel === "tous" || post.channel_id === activeChannel)
    .filter((post) => `${post.title} ${post.body} ${post.format}`.toLowerCase().includes(query.toLowerCase())), [posts, activeChannel, query]);

  const stats = useMemo(() => ({
    views: posts.reduce((sum, post) => sum + Number(post.view_count || 0), 0),
    reactions: posts.reduce((sum, post) => sum + Number(post.reaction_count || 0), 0),
    comments: posts.reduce((sum, post) => sum + Number(post.comment_count || 0), 0),
    channels: channels.length,
  }), [posts, channels]);

  async function signInOrUp(event) {
    event.preventDefault();
    setLoading(true);
    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
      if (error) notify(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password,
        options: { data: { full_name: authForm.fullName || authForm.email } },
      });
      if (error) notify(error.message);
      else notify("Compte créé. Vérifiez votre email si la confirmation est activée.");
    }
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function createChannel() {
    if (!isAdmin) return notify("Action réservée aux administrateurs");
    if (!channelForm.title.trim()) return notify("Nom du canal requis");
    const { error } = await supabase.from("channels").insert({
      title: channelForm.title.trim(),
      slug: slugify(channelForm.title),
      description: channelForm.description.trim(),
      color: channelForm.color,
      created_by: session.user.id,
    });
    if (error) notify(error.message);
    else {
      setChannelOpen(false);
      setChannelForm({ title: "", description: "", color: COLORS[channels.length % COLORS.length] });
      notify("Canal créé");
    }
  }

  async function uploadSelectedFile(postId) {
    if (!file) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `${postId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return { path, name: file.name, type: file.type, size: file.size };
  }

  async function publishPost() {
    if (!isAdmin) return notify("Action réservée aux administrateurs");
    if (!postForm.title.trim() || !postForm.body.trim() || !postForm.channel_id) return notify("Titre, message et canal sont requis");
    const pollOptions = postForm.poll_options.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 8);
    const { data: inserted, error } = await supabase.from("posts").insert({
      channel_id: postForm.channel_id,
      title: postForm.title.trim(),
      body: postForm.body.trim(),
      format: postForm.format,
      pinned: postForm.pinned,
      author_id: session.user.id,
      poll_question: postForm.format === "Questionnaire" ? (postForm.poll_question.trim() || "Votre avis nous intéresse") : null,
      poll_options: postForm.format === "Questionnaire" ? pollOptions : null,
    }).select("id").single();
    if (error) return notify(error.message);
    try {
      const meta = await uploadSelectedFile(inserted.id);
      if (meta) await supabase.from("posts").update({ file_path: meta.path, file_name: meta.name, file_type: meta.type, file_size: meta.size }).eq("id", inserted.id);
    } catch (uploadError) {
      notify(uploadError.message);
      return;
    }
    setComposerOpen(false);
    setFile(null);
    setPostForm({ channel_id: channels[0]?.id || "", title: "", body: "", format: "Texte", pinned: false, poll_question: "", poll_options: "Oui\nNon\nJe ne sais pas encore" });
    notify("Publication diffusée");
  }

  async function selectPost(post) {
    setSelectedId(post.id);
    await supabase.from("post_views").insert({ post_id: post.id, user_id: session.user.id });
  }

  async function toggleReaction(postId) {
    const { data: existing } = await supabase.from("reactions").select("id").eq("post_id", postId).eq("user_id", session.user.id).maybeSingle();
    if (existing) await supabase.from("reactions").delete().eq("id", existing.id);
    else await supabase.from("reactions").insert({ post_id: postId, user_id: session.user.id });
  }

  async function addComment() {
    if (!commentText.trim() || !selectedPost) return;
    const { error } = await supabase.from("comments").insert({ post_id: selectedPost.id, user_id: session.user.id, body: commentText.trim() });
    if (error) notify(error.message);
    else {
      setCommentText("");
      notify("Commentaire publié");
    }
  }

  async function vote(postId, optionIndex) {
    const { error } = await supabase.from("poll_votes").insert({ post_id: postId, user_id: session.user.id, option_index: optionIndex });
    if (error) notify("Vous avez déjà répondu ou le vote est indisponible");
    else notify("Réponse enregistrée");
  }

  async function getSignedUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (error) {
      notify(error.message);
      return null;
    }
    return data.signedUrl;
  }

  if (loading && !session) return <div className="center">Chargement...</div>;

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="logo big">RH</div>
          <h1>InfoConnect RH</h1>
          <p>Connectez-vous pour accéder aux canaux d'information internes.</p>
          <form onSubmit={signInOrUp} className="auth-form">
            {authMode === "signup" && <input value={authForm.fullName} onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })} placeholder="Nom complet" />}
            <input type="email" required value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="Email professionnel" />
            <input type="password" required minLength="6" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} placeholder="Mot de passe" />
            <button className="primary">{authMode === "signin" ? "Se connecter" : "Créer un compte"}</button>
          </form>
          <button className="link" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>{authMode === "signin" ? "Créer un compte salarié" : "J’ai déjà un compte"}</button>
          <p className="hint">Le premier administrateur se définit via le script SQL fourni dans `/supabase/02-seed-admin.sql`.</p>
        </section>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="logo">RH SAE</div><div><h1>InfoConnect RH</h1><p>{profile?.full_name || session.user.email} · {isAdmin ? "Admin" : "Salarié"}</p></div></div>
        <nav className="channels">
          <button className={activeChannel === "tous" ? "channel selected" : "channel"} onClick={() => setActiveChannel("tous")}><span className="dot dark">⌂</span><span><strong>Tous les canaux</strong><small>Fil complet</small></span></button>
          {channels.map((channel) => <button key={channel.id} className={activeChannel === channel.id ? "channel selected" : "channel"} onClick={() => setActiveChannel(channel.id)}><span className="dot" style={{ background: channel.color }}>#</span><span><strong>{channel.title}</strong><small>{channel.description || "Canal interne"}</small></span></button>)}
        </nav>
        <div className="side-actions">
          {isAdmin && <button className="primary wide" onClick={() => setChannelOpen(true)}>+ Créer un canal</button>}
          <button className="ghost wide" onClick={signOut}>Se déconnecter</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar"><div><p className="eyebrow">Production Supabase</p><h2>Communication interne mobile</h2></div><div className="actions">{isAdmin && <button className="primary" onClick={() => setComposerOpen(true)}>+ Nouvelle publication</button>}</div></header>
        <section className="stats"><Metric label="Vues" value={stats.views} emoji="👁️"/><Metric label="Réactions" value={stats.reactions} emoji="👍"/><Metric label="Commentaires" value={stats.comments} emoji="💬"/><Metric label="Canaux" value={stats.channels} emoji="📣"/></section>
        <div className="layout">
          <section className="feed">
            <label className="search"><span>🔎</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une info, un format, un canal..." /></label>
            {visiblePosts.length === 0 ? <div className="empty"><h3>Aucune publication</h3><p>Créez du contenu depuis le mode administrateur.</p></div> : visiblePosts.map((post) => <PostCard key={post.id} post={post} channel={channels.find((c) => c.id === post.channel_id)} selected={selectedPost?.id === post.id} onSelect={() => selectPost(post)} onReact={() => toggleReaction(post.id)} />)}
          </section>
          <aside className="detail">
            {selectedPost && <PostDetail post={selectedPost} channel={selectedChannel} comments={selectedPost.comments || []} onReact={() => toggleReaction(selectedPost.id)} onVote={vote} getSignedUrl={getSignedUrl} commentText={commentText} setCommentText={setCommentText} addComment={addComment} />}
          </aside>
        </div>
      </main>

      {composerOpen && <Modal title="Nouvelle publication" onClose={() => setComposerOpen(false)}><div className="form-grid"><label>Titre<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}/></label><label>Canal<select value={postForm.channel_id} onChange={(e) => setPostForm({ ...postForm, channel_id: e.target.value })}>{channels.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>Format<select value={postForm.format} onChange={(e) => setPostForm({ ...postForm, format: e.target.value })}>{formats.map((f) => <option key={f}>{f}</option>)}</select></label><label className="full">Message<textarea rows="5" value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })}/></label><label className="full">Fichier<input type="file" accept=".pdf,image/*,video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label>{file && <p className="hint full">Fichier sélectionné : {file.name}</p>}{postForm.format === "Questionnaire" && <><label className="full">Question<input value={postForm.poll_question} onChange={(e) => setPostForm({ ...postForm, poll_question: e.target.value })}/></label><label className="full">Options, une par ligne<textarea rows="4" value={postForm.poll_options} onChange={(e) => setPostForm({ ...postForm, poll_options: e.target.value })}/></label></>}<label className="check full"><input type="checkbox" checked={postForm.pinned} onChange={(e) => setPostForm({ ...postForm, pinned: e.target.checked })}/> Épingler</label><div className="modal-actions full"><button className="ghost" onClick={() => setComposerOpen(false)}>Annuler</button><button className="primary" onClick={publishPost}>Publier</button></div></div></Modal>}
      {channelOpen && <Modal title="Créer un canal" onClose={() => setChannelOpen(false)}><div className="form-grid"><label className="full">Nom<input value={channelForm.title} onChange={(e) => setChannelForm({ ...channelForm, title: e.target.value })}/></label><label className="full">Description<input value={channelForm.description} onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })}/></label><div className="colors full">{COLORS.map((color) => <button key={color} className={channelForm.color === color ? "color selected-color" : "color"} style={{ background: color }} onClick={() => setChannelForm({ ...channelForm, color })}/>)}</div><div className="modal-actions full"><button className="ghost" onClick={() => setChannelOpen(false)}>Annuler</button><button className="primary" onClick={createChannel}>Créer</button></div></div></Modal>}
     
      <InstallBanner />
      
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
function InstallBanner() {
  
function Metric({ label, value, emoji }) { return <div className="metric"><span>{emoji}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }
function PostCard({ post, channel, selected, onSelect, onReact }) { return <article className={selected ? "post selected-post" : "post"} onClick={onSelect}><div className="post-icon" style={{ background: channel?.color || "#475569" }}>{formatEmoji[post.format]}</div><div className="post-content"><div className="post-meta"><span>{post.format}</span><span>{channel?.title}</span>{post.pinned && <strong>Épinglé</strong>}</div><h3>{post.title}</h3><p>{post.body}</p><div className="post-stats"><span>{post.view_count || 0} vues</span><button onClick={(e) => { e.stopPropagation(); onReact(); }}>👍 {post.reaction_count || 0}</button><span>💬 {post.comment_count || 0}</span><span>{new Date(post.created_at).toLocaleDateString("fr-FR")}</span></div></div></article>; }

function PostDetail({ post, channel, comments, onReact, onVote, getSignedUrl, commentText, setCommentText, addComment }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { setUrl(null); if (post.file_path) getSignedUrl(post.file_path).then(setUrl); }, [post.id, post.file_path]);
  return <article className="detail-card"><div className="detail-head"><div><span className="badge" style={{ borderColor: channel?.color }}>{channel?.title || "Canal"} · {post.format}</span><h3>{post.title}</h3><p>{new Date(post.created_at).toLocaleString("fr-FR")}</p></div>{post.pinned && <span className="pin">Épinglé</span>}</div><FormatPreview post={post} url={url}/><p className="body-text">{post.body}</p>{post.poll_question && <Poll post={post} onVote={onVote}/>}<div className="detail-actions"><button className="ghost" onClick={onReact}>👍 Réagir</button><button className="ghost" onClick={() => document.getElementById("comment-input")?.focus()}>💬 Participer</button></div><section className="comments"><h4>Commentaires & questions</h4>{comments.length === 0 && <p className="empty-comment">Aucun commentaire pour le moment.</p>}{comments.map((comment) => <div className="comment" key={comment.id}><strong>{comment.full_name || "Salarié"}</strong><p>{comment.body}</p></div>)}<div className="comment-form"><input id="comment-input" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Répondre ou poser une question..."/><button className="primary" onClick={addComment}>Publier</button></div></section></article>;
}

function FormatPreview({ post, url }) {
  if (url && post.format === "Image") return <img className="media-preview" src={url} alt={post.title}/>;
  if (url && post.format === "Audio") return <audio className="media-audio" controls src={url}/>;
  if (url && post.format === "Vidéo") return <video className="media-video" controls src={url}/>;
  if (url && post.format === "PDF") return <iframe className="media-pdf" title={post.title} src={url}/>;
  return <div className="preview"><span>{formatEmoji[post.format]}</span><strong>{post.file_name || post.format}</strong><small>{post.file_path ? "Chargement du fichier sécurisé..." : "Aucun fichier joint"}</small></div>;
}

function Poll({ post, onVote }) {
  const results = post.poll_results || [];
  const total = results.reduce((sum, option) => sum + Number(option.votes || 0), 0);
  return <div className="poll"><h4>{post.poll_question}</h4>{(post.poll_options || []).map((label, index) => { const found = results.find((r) => Number(r.option_index) === index); const votes = Number(found?.votes || 0); const pct = total ? Math.round((votes / total) * 100) : 0; return <button key={label} onClick={() => onVote(post.id, index)}><span>{label}</span><strong>{pct}%</strong><i style={{ width: `${pct}%` }}/></button>; })}</div>;
}
function Modal({ title, children, onClose }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h3>{title}</h3><button onClick={onClose}>×</button></div>{children}</div></div>; }

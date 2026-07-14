import { getAllVideos, saveVideo, deleteVideo, getVideo, getAllPlaylists, savePlaylist, deletePlaylist } from './db.js';

const $ = selector => document.querySelector(selector);
const state = { videos: [], playlists: [], view: 'library', playlistId: null, queue: [], currentId: null, objectUrl: null, shuffle: false, repeat: false, addTarget: null, installPrompt: null };
const player = $('#videoPlayer');

function id() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function formatTime(value) { if (!Number.isFinite(value)) return '0:00'; const h = Math.floor(value / 3600); const m = Math.floor(value % 3600 / 60); const s = Math.floor(value % 60); return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`; }
function formatSize(bytes) { if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(1)} GB`; }
function escapeHtml(value='') { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200); }

async function loadState() { [state.videos, state.playlists] = await Promise.all([getAllVideos(), getAllPlaylists()]); render(); updateStorage(); }

function visibleVideos() {
  let items = [...state.videos];
  if (state.view === 'favorites') items = items.filter(v => v.favorite);
  if (state.view === 'recent') items = items.filter(v => Date.now() - v.addedAt < 1000 * 60 * 60 * 24 * 30);
  if (state.view === 'playlist') { const list = state.playlists.find(p => p.id === state.playlistId); items = (list?.videoIds || []).map(videoId => state.videos.find(v => v.id === videoId)).filter(Boolean); }
  const term = $('#searchInput').value.trim().toLocaleLowerCase('ja');
  if (term) items = items.filter(v => v.name.toLocaleLowerCase('ja').includes(term));
  if (state.view !== 'playlist') {
    const sort = $('#sortSelect').value;
    items.sort((a,b) => sort === 'oldest' ? a.addedAt-b.addedAt : sort === 'name' ? a.name.localeCompare(b.name,'ja') : sort === 'duration' ? b.duration-a.duration : b.addedAt-a.addedAt);
  }
  return items;
}

function render() {
  const titles = { library:['MY LIBRARY','すべての動画','端末に保存した動画をオフラインで楽しめます'], recent:['RECENTLY ADDED','最近追加','30日以内に追加した動画'], favorites:['FAVORITES','お気に入り','お気に入りに登録した動画'] };
  const playlist = state.playlists.find(p => p.id === state.playlistId);
  const copy = state.view === 'playlist' ? ['PLAYLIST', playlist?.name || 'プレイリスト', `${playlist?.videoIds.length || 0}本の動画`] : titles[state.view];
  $('#viewEyebrow').textContent = copy[0]; $('#viewTitle').textContent = copy[1]; $('#viewSubtitle').textContent = copy[2];
  $('#allCount').textContent = state.videos.length;
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', state.view !== 'playlist' && x.dataset.view === state.view));
  renderPlaylists(); renderVideos();
}

function renderPlaylists() {
  $('#playlistList').innerHTML = state.playlists.map(p => `<div class="playlist-item"><button class="nav-item ${state.view==='playlist'&&state.playlistId===p.id?'active':''}" data-playlist="${p.id}"><span>☷</span>${escapeHtml(p.name)} <b>${p.videoIds.length}</b></button><button class="icon-button playlist-delete" data-delete-playlist="${p.id}" aria-label="削除">×</button></div>`).join('');
}

function renderVideos() {
  const items = visibleVideos(); const grid = $('#videoGrid');
  grid.innerHTML = items.map(v => `<article class="video-card" data-id="${v.id}" ${state.view==='playlist'?'draggable="true"':''}><div class="thumbnail" data-play="${v.id}"><div class="thumbnail-placeholder">▸</div>${v.thumbnail ? `<img src="${v.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}<span class="duration-badge">${formatTime(v.duration)}</span><button class="favorite-button ${v.favorite?'active':''}" data-favorite="${v.id}" aria-label="お気に入り">${v.favorite?'♥':'♡'}</button></div><div class="video-info"><div class="video-copy"><strong title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</strong><span>${formatSize(v.size)} ・ ${new Date(v.addedAt).toLocaleDateString('ja-JP')}</span></div><div class="more-wrap"><button class="icon-button more-button" data-more="${v.id}" aria-label="その他">⋯</button></div></div></article>`).join('');
  $('#emptyState').hidden = items.length > 0; grid.hidden = items.length === 0;
  $('#playAllButton').disabled = items.length === 0;
  if (!items.length && state.videos.length) { $('#emptyTitle').textContent = '動画が見つかりません'; $('#emptyMessage').textContent = '検索条件やプレイリストを変更してください。'; }
  else { $('#emptyTitle').textContent = '動画を追加しましょう'; $('#emptyMessage').textContent = '端末の動画を選ぶと、通信なしでも再生できます。'; }
}

async function inspectFile(file) {
  return new Promise(resolve => {
    const video = document.createElement('video'); const url = URL.createObjectURL(file); video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => { const duration = video.duration || 0; video.currentTime = Math.min(1, duration / 3 || 0); };
    video.onseeked = () => { let thumbnail = ''; try { const canvas=document.createElement('canvas'); const scale=Math.min(1,640/video.videoWidth); canvas.width=Math.round(video.videoWidth*scale)||320; canvas.height=Math.round(video.videoHeight*scale)||180; canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height); thumbnail=canvas.toDataURL('image/jpeg',.72); } catch {} URL.revokeObjectURL(url); resolve({ duration: video.duration || 0, thumbnail }); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve({duration:0,thumbnail:''}); };
  });
}

async function importFiles(files) {
  if (!files.length) return; toast(`${files.length}本の動画を保存しています…`);
  let count = 0;
  for (const file of files) {
    if (!file.type.startsWith('video/')) continue;
    try { const meta=await inspectFile(file); const video={id:id(),name:file.name.replace(/\.[^.]+$/,''),type:file.type,size:file.size,duration:meta.duration,thumbnail:meta.thumbnail,blob:file,addedAt:Date.now()+count,favorite:false,lastPosition:0}; await saveVideo(video); state.videos.push(video); count++; }
    catch (error) { console.error(error); toast(`${file.name}を保存できませんでした`); }
  }
  $('#fileInput').value=''; render(); updateStorage(); toast(`${count}本の動画を追加しました`);
}

async function playVideo(videoId, queue = visibleVideos().map(v => v.id), autoplay = true) {
  const video = await getVideo(videoId); if (!video) return;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl=URL.createObjectURL(video.blob); state.currentId=videoId; state.queue=queue;
  player.src=state.objectUrl; player.currentTime=video.lastPosition || 0; $('#nowTitle').textContent=video.name; $('#modalTitle').textContent=video.name; $('#nowMeta').textContent=`${formatTime(video.duration)} ・ オフライン`; $('#durationText').textContent=formatTime(video.duration); $('#playerDock').hidden=false;
  if (autoplay) { try { await player.play(); } catch {} } updatePlayButtons();
}

function nextVideo(direction=1) {
  if (!state.queue.length) return; let index=state.queue.indexOf(state.currentId);
  if (state.shuffle && direction > 0) index=Math.floor(Math.random()*state.queue.length); else index=(index+direction+state.queue.length)%state.queue.length;
  playVideo(state.queue[index],state.queue);
}

async function removeVideo(videoId) {
  const video=state.videos.find(v=>v.id===videoId); if (!video || !confirm(`「${video.name}」を端末から削除しますか？`)) return;
  await deleteVideo(videoId); state.videos=state.videos.filter(v=>v.id!==videoId);
  for (const p of state.playlists) { if (p.videoIds.includes(videoId)) { p.videoIds=p.videoIds.filter(x=>x!==videoId); await savePlaylist(p); } }
  if (state.currentId===videoId) { player.pause(); player.removeAttribute('src'); $('#playerDock').hidden=true; state.currentId=null; }
  render(); updateStorage(); toast('動画を削除しました');
}

function openAddTo(videoId) {
  state.addTarget=videoId; const video=state.videos.find(v=>v.id===videoId); $('#addToVideoName').textContent=video?.name||'';
  $('#playlistChecks').innerHTML=state.playlists.length ? state.playlists.map(p=>`<label><input type="checkbox" value="${p.id}" ${p.videoIds.includes(videoId)?'checked':''}> ${escapeHtml(p.name)}</label>`).join('') : '<p>先にプレイリストを作成してください。</p>';
  $('#addToDialog').showModal();
}

async function updateStorage() {
  const own=state.videos.reduce((sum,v)=>sum+v.size,0); let usage=own,quota=0; try { const estimate=await navigator.storage?.estimate(); usage=estimate?.usage||own; quota=estimate?.quota||0; } catch {}
  $('#storageText').textContent=quota?`${formatSize(own)} / ${formatSize(quota)}`:formatSize(own); $('#storageBar').style.width=quota?`${Math.min(100,usage/quota*100)}%`:'0%';
}

function updatePlayButtons() { const playing=!player.paused; $('#dockPlayButton').textContent=playing?'Ⅱ':'▶'; $('#dockPlayButton').setAttribute('aria-label',playing?'一時停止':'再生'); }

document.addEventListener('click', async event => {
  const t=event.target.closest('button'); if (!t) return;
  if (t.id==='importButton'||t.id==='emptyImportButton') $('#fileInput').click();
  if (t.id==='openSidebar') $('#sidebar').classList.add('open'); if (t.id==='closeSidebar') $('#sidebar').classList.remove('open');
  if (t.dataset.view) { state.view=t.dataset.view; state.playlistId=null; $('#sidebar').classList.remove('open'); render(); }
  if (t.dataset.playlist) { state.view='playlist'; state.playlistId=t.dataset.playlist; $('#sidebar').classList.remove('open'); render(); }
  if (t.dataset.play) playVideo(t.dataset.play);
  if (t.dataset.favorite) { const v=state.videos.find(x=>x.id===t.dataset.favorite); v.favorite=!v.favorite; await saveVideo(v); renderVideos(); }
  if (t.dataset.more) { document.querySelectorAll('.card-menu').forEach(x=>x.remove()); const menu=document.createElement('div'); menu.className='card-menu'; menu.innerHTML=`<button data-addto="${t.dataset.more}">＋ プレイリストに追加</button><button data-rename="${t.dataset.more}">✎ 名前を変更</button><button class="danger" data-remove="${t.dataset.more}">× 端末から削除</button>`; t.parentElement.append(menu); }
  if (t.dataset.addto) openAddTo(t.dataset.addto);
  if (t.dataset.rename) { const v=state.videos.find(x=>x.id===t.dataset.rename); const name=prompt('動画の名前',v.name); if(name?.trim()){v.name=name.trim();await saveVideo(v);render();} }
  if (t.dataset.remove) removeVideo(t.dataset.remove);
  if (t.id==='newPlaylistButton') { $('#playlistForm').reset(); $('#playlistDialog').showModal(); setTimeout(()=>$('#playlistName').focus(),50); }
  if (t.dataset.deletePlaylist) { const p=state.playlists.find(x=>x.id===t.dataset.deletePlaylist); if(confirm(`プレイリスト「${p.name}」を削除しますか？\n動画本体は削除されません。`)){await deletePlaylist(p.id);state.playlists=state.playlists.filter(x=>x.id!==p.id);state.view='library';render();} }
  if (t.id==='savePlaylist') { event.preventDefault(); const name=$('#playlistName').value.trim(); if(!name)return; const p={id:id(),name,videoIds:[],createdAt:Date.now()};await savePlaylist(p);state.playlists.push(p);$('#playlistDialog').close();render();toast('プレイリストを作成しました'); }
  if (t.id==='applyPlaylists') { event.preventDefault(); const selected=[...$('#playlistChecks').querySelectorAll(':checked')].map(x=>x.value); for(const p of state.playlists){const has=p.videoIds.includes(state.addTarget);if(selected.includes(p.id)&&!has)p.videoIds.push(state.addTarget);if(!selected.includes(p.id)&&has)p.videoIds=p.videoIds.filter(x=>x!==state.addTarget);await savePlaylist(p);}$('#addToDialog').close();render();toast('プレイリストを更新しました'); }
  if (t.id==='playAllButton') { const items=visibleVideos(); if(items.length)playVideo(items[0].id,items.map(v=>v.id)); }
  if (t.id==='dockPlayButton') player.paused?player.play():player.pause(); if(t.id==='previousButton')nextVideo(-1);if(t.id==='nextButton')nextVideo(1);
  if (t.id==='shuffleButton') { state.shuffle=!state.shuffle;t.classList.toggle('active',state.shuffle);toast(state.shuffle?'シャッフル再生 ON':'シャッフル再生 OFF'); }
  if (t.id==='repeatButton') { state.repeat=!state.repeat;t.classList.toggle('active',state.repeat);toast(state.repeat?'1本リピート ON':'リピート OFF'); }
  if (t.id==='expandPlayer') $('#playerModal').showModal(); if(t.id==='closePlayer') $('#playerModal').close();
  if (t.id==='installButton'&&state.installPrompt) { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt=null;t.hidden=true; }
});

$('#fileInput').addEventListener('change',e=>importFiles([...e.target.files])); $('#searchInput').addEventListener('input',renderVideos); $('#sortSelect').addEventListener('change',renderVideos);
player.addEventListener('play',updatePlayButtons);player.addEventListener('pause',updatePlayButtons);player.addEventListener('loadedmetadata',()=>{$('#durationText').textContent=formatTime(player.duration)});player.addEventListener('timeupdate',()=>{$('#currentTime').textContent=formatTime(player.currentTime);$('#seekBar').value=player.duration?player.currentTime/player.duration*100:0;});
player.addEventListener('ended',()=>{if(state.repeat){player.currentTime=0;player.play();}else nextVideo(1)});player.addEventListener('pause',async()=>{const v=state.videos.find(x=>x.id===state.currentId);if(v&&Math.abs((v.lastPosition||0)-player.currentTime)>2){v.lastPosition=player.ended?0:player.currentTime;await saveVideo(v);}});
$('#seekBar').addEventListener('input',e=>{if(player.duration)player.currentTime=e.target.value/100*player.duration});$('#volumeBar').addEventListener('input',e=>player.volume=e.target.value);
let dragged=null;$('#videoGrid').addEventListener('dragstart',e=>{dragged=e.target.closest('.video-card')?.dataset.id});$('#videoGrid').addEventListener('dragover',e=>e.preventDefault());$('#videoGrid').addEventListener('drop',async e=>{e.preventDefault();const target=e.target.closest('.video-card')?.dataset.id;if(!dragged||!target||dragged===target||state.view!=='playlist')return;const p=state.playlists.find(x=>x.id===state.playlistId);const from=p.videoIds.indexOf(dragged),to=p.videoIds.indexOf(target);p.videoIds.splice(from,1);p.videoIds.splice(to,0,dragged);await savePlaylist(p);renderVideos();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;$('#installButton').hidden=false});
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
loadState().catch(error=>{console.error(error);toast('保存領域を開けませんでした。プライベートモードを解除してください。')});

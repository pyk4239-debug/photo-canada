import { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC5yDWg6hSIihP_U25iyTaIUctYmf18iz0",
  authDomain: "photo-canada.firebaseapp.com",
  projectId: "photo-canada",
  storageBucket: "photo-canada.firebasestorage.app",
  messagingSenderId: "12021571274",
  appId: "1:12021571274:web:681c9724d46dd40fefde33"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const MONTH_LABELS = {
  "01":"1월","02":"2월","03":"3월","04":"4월",
  "05":"5월","06":"6월","07":"7월","08":"8월",
  "09":"9월","10":"10월","11":"11월","12":"12월",
};
const DAY_LABELS = ["일","월","화","수","목","금","토"];

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}
function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// 달력
function Calendar({ selected, onSelect }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected ? new Date(selected+"T00:00:00").getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected ? new Date(selected+"T00:00:00").getMonth() : today.getMonth());
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const prevMonth = () => { if (viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1); };
  const todayYMD = toYMD(today);
  return (
    <div style={{ background:"#fff", borderRadius:12, padding:"12px 8px", marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, padding:"0 4px" }}>
        <button onClick={prevMonth} style={calNavBtn}>‹</button>
        <span style={{ fontSize:14, fontWeight:600, color:"#222" }}>{viewYear}년 {viewMonth+1}월</span>
        <button onClick={nextMonth} style={calNavBtn}>›</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
        {DAY_LABELS.map((d,i) => (
          <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:500,
            color: i===0?"#e74c3c":i===6?"#3498db":"#aaa", padding:"2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
        {cells.map((day,i) => {
          if (!day) return <div key={i}/>;
          const ymd = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isSelected = ymd === selected;
          const isToday = ymd === todayYMD;
          const dow = (firstDay+day-1)%7;
          return (
            <div key={i} onClick={() => onSelect(ymd)} style={{
              textAlign:"center", padding:"7px 0", borderRadius:8, cursor:"pointer",
              fontSize:13, fontWeight: isSelected?700:400,
              background: isSelected?"#222":isToday?"#f0f0f0":"transparent",
              color: isSelected?"#fff":dow===0?"#e74c3c":dow===6?"#3498db":"#333",
              transition:"background 0.15s",
            }}>{day}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function PhotoCanada() {
  const [allCards, setAllCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [thumbIndex, setThumbIndex] = useState(0);
  const [sliding, setSliding] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [editCard, setEditCard] = useState(null); // 수정 대상 카드
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const today = toYMD(new Date());
  const [formDate, setFormDate] = useState(today);
  const [formMemo, setFormMemo] = useState("");
  const [formFiles, setFormFiles] = useState([]);
  const fileInputRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Firestore에서 데이터 로드
  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "cards"), orderBy("date", "desc"));
      const snap = await getDocs(q);
      const cards = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllCards(cards);
      if (cards.length > 0) {
        const latestMonth = cards[0].date.slice(0,7);
        setCurrentMonth(latestMonth);
      }
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  // 월별 카드
  const months = [...new Set(allCards.map(c => c.date.slice(0,7)))].sort((a,b) => b.localeCompare(a));
  const cards = allCards.filter(c => c.date.startsWith(currentMonth)).sort((a,b) => a.date.localeCompare(b.date));

  const goTo = (newIndex, dir) => {
    if (sliding) return;
    setSliding(dir);
    setTimeout(() => { setCardIndex(newIndex); setThumbIndex(0); setSliding(null); }, 220);
  };
  const prevCard = () => { if (cardIndex > 0) goTo(cardIndex-1, "right"); };
  const nextCard = () => { if (cardIndex < cards.length-1) goTo(cardIndex+1, "left"); };

  const changeMonth = (dir) => {
    const idx = months.indexOf(currentMonth);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= months.length) return;
    setCurrentMonth(months[newIdx]);
    setCardIndex(0); setThumbIndex(0);
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) nextCard(); else prevCard();
    }
    touchStartX.current = null;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith("video") ? "video" : "photo";
      setFormFiles(prev => [...prev, { url, file, type }]);
    });
  };

  // Firebase Storage 업로드
  const uploadFile = (file) => {
    return new Promise((resolve, reject) => {
      const ext = file.name.split(".").pop();
      const path = `cards/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on("state_changed",
        (snap) => {
          const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(Math.round(pct));
        },
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        }
      );
    });
  };

  const handleSave = async () => {
    if (!formDate) return;
    setUploading(true);
    try {
      let urls = [];
      for (let i = 0; i < formFiles.length; i++) {
        setUploadProgress(0);
        const url = await uploadFile(formFiles[i].file);
        urls.push(url);
      }
      const fileTypes = formFiles.map(f => f.type);
      const newCard = {
        date: formDate,
        type: fileTypes.some(t => t === "video") ? "video" : "photo",
        files: urls.length > 0 ? urls : [],
        fileTypes: fileTypes,
        memo: formMemo,
        createdAt: Date.now(),
      };
      await addDoc(collection(db, "cards"), newCard);
      await loadCards();
      setCurrentMonth(formDate.slice(0,7));
      setCardIndex(0);
      setFormDate(today);
      setFormMemo("");
      setFormFiles([]);
      setShowSheet(false);
    } catch(e) {
      alert("저장 중 오류가 발생했어요: " + e.message);
    }
    setUploading(false);
  };

  // 삭제
  const handleDelete = async (cardId) => {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "cards", cardId));
      await loadCards();
      setCardIndex(0);
    } catch(e) {
      alert("삭제 중 오류: " + e.message);
    }
  };

  // 수정 시트 열기
  const handleEditOpen = (card) => {
    setEditCard(card);
    setFormDate(card.date);
    setFormMemo(card.memo);
    setFormFiles([]);
    setShowSheet(true);
  };

  // 수정 저장
  const handleUpdate = async () => {
    if (!editCard) return;
    setUploading(true);
    try {
      let newUrls = [];
      for (let i = 0; i < formFiles.length; i++) {
        setUploadProgress(0);
        const url = await uploadFile(formFiles[i].file);
        newUrls.push(url);
      }
      const updatedFiles = newUrls.length > 0 ? [...editCard.files, ...newUrls] : editCard.files;
      const updatedTypes = newUrls.length > 0
        ? [...(editCard.fileTypes || editCard.files.map(() => "photo")), ...formFiles.map(f => f.type)]
        : (editCard.fileTypes || editCard.files.map(() => "photo"));
      await updateDoc(doc(db, "cards", editCard.id), {
        date: formDate,
        memo: formMemo,
        files: updatedFiles,
        fileTypes: updatedTypes,
      });
      await loadCards();
      setEditCard(null);
      setFormDate(today);
      setFormMemo("");
      setFormFiles([]);
      setShowSheet(false);
    } catch(e) {
      alert("수정 중 오류: " + e.message);
    }
    setUploading(false);
  };

  const card = cards[cardIndex];
  const monthParts = currentMonth.split("-");
  const monthLabel = currentMonth ? `${monthParts[0]}년 ${MONTH_LABELS[monthParts[1]]}` : "";
  const monthIdx = months.indexOf(currentMonth);
  const cardTransform = sliding==="left" ? "translateX(-50px)" : sliding==="right" ? "translateX(50px)" : "translateX(0)";

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"#f5f5f5", fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif", color:"#bbb", fontSize:14 }}>
      불러오는 중...
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh", background:"#f5f5f5",
      display:"flex", flexDirection:"column", alignItems:"center",
      fontFamily:"'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif",
      color:"#1a1a1a", userSelect:"none", overflowX:"hidden",
    }}>

      {/* 헤더 */}
      <div style={{ width:"100%", maxWidth:420, padding:"28px 20px 12px",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:11, letterSpacing:4, color:"#aaa", textTransform:"uppercase" }}>Photo Diary</div>
          <div style={{ fontSize:22, fontWeight:"700", marginTop:3, color:"#111" }}>Canada 🍁</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={() => changeMonth(1)} disabled={monthIdx >= months.length-1} style={navBtn(monthIdx >= months.length-1)}>‹</button>
          <span style={{ fontSize:14, color:"#555", minWidth:80, textAlign:"center", fontWeight:500 }}>{monthLabel}</span>
          <button onClick={() => changeMonth(-1)} disabled={monthIdx <= 0} style={navBtn(monthIdx <= 0)}>›</button>
        </div>
      </div>

      {/* 카드 */}
      {card ? (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          style={{ width:"100%", maxWidth:420, padding:"0 16px",
            transform:cardTransform,
            transition: sliding ? "transform 0.22s cubic-bezier(.4,0,.2,1)" : "none",
          }}>
          <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ position:"relative", aspectRatio:"4/5", background:"#e0e0e0" }}>
              {(card.fileTypes?.[thumbIndex] === "video") ? (
                <video src={card.files[thumbIndex]} controls
                  style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
              ) : (
                <img src={card.files[thumbIndex]} alt=""
                  style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
              )}
            </div>
            {card.files.length > 1 && (
              <div style={{ display:"flex", gap:4, padding:"8px 8px 0", overflowX:"auto" }}>
                {card.files.map((src, i) => {
                  const isVideo = card.fileTypes?.[i] === "video";
                  return isVideo ? (
                    <video key={i} src={src} onClick={() => setThumbIndex(i)}
                      style={{
                        width:56, height:56, flexShrink:0, objectFit:"cover", borderRadius:8,
                        border: i===thumbIndex ? "2px solid #222" : "2px solid transparent",
                        cursor:"pointer", opacity: i===thumbIndex ? 1 : 0.6,
                      }} />
                  ) : (
                    <img key={i} src={src} alt="" onClick={() => setThumbIndex(i)}
                      style={{
                        width:56, height:56, flexShrink:0, objectFit:"cover", borderRadius:8,
                        border: i===thumbIndex ? "2px solid #222" : "2px solid transparent",
                        cursor:"pointer", opacity: i===thumbIndex ? 1 : 0.6, transition:"all 0.2s",
                      }} />
                  );
                })}
              </div>
            )}
            <div style={{ padding:"14px 18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:12, color:"#999", fontWeight:500 }}>{formatDate(card.date)}</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => handleEditOpen(card)}
                    style={{ fontSize:12, color:"#888", background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>
                    수정
                  </button>
                  <button onClick={() => handleDelete(card.id)}
                    style={{ fontSize:12, color:"#e74c3c", background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>
                    삭제
                  </button>
                </div>
              </div>
              <p style={{ margin:0, fontSize:14, lineHeight:1.8, color:"#333" }}>{card.memo}</p>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 2px 60px", fontSize:12, color:"#bbb" }}>
            <span>{cardIndex > 0 ? "← " + formatDate(cards[cardIndex-1].date) : ""}</span>
            <span>{cardIndex < cards.length-1 ? formatDate(cards[cardIndex+1].date) + " →" : ""}</span>
          </div>
        </div>
      ) : (
        <div style={{ color:"#bbb", fontSize:14, marginTop:80, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📷</div>
          첫 번째 기록을 남겨보세요
        </div>
      )}

      <div style={{ position:"fixed", bottom:36, left:24, fontSize:11, color:"#ccc", letterSpacing:1 }}>
        {cards.length > 0 ? `${cardIndex+1} / ${cards.length}` : ""}
      </div>

      {/* + 버튼 */}
      <button onClick={() => setShowSheet(true)} style={{
        position:"fixed", bottom:24, right:24,
        width:52, height:52, borderRadius:"50%",
        background:"#222", border:"none", color:"#fff", fontSize:26,
        cursor:"pointer", boxShadow:"0 4px 16px rgba(0,0,0,0.18)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>+</button>

      {/* 등록 시트 */}
      {showSheet && (
        <>
          <div onClick={() => { if(!uploading){ setShowSheet(false); setEditCard(null); setFormFiles([]); } }}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:100 }} />
          <div style={{
            position:"fixed", bottom:0, left:0, right:0,
            background:"#f5f5f5", borderRadius:"20px 20px 0 0",
            padding:"20px 20px 40px", zIndex:101,
            maxHeight:"92vh", overflowY:"auto",
            boxShadow:"0 -4px 30px rgba(0,0,0,0.15)",
          }}>
            <div style={{ width:36, height:4, background:"#ddd", borderRadius:2, margin:"0 auto 20px" }} />
            <div style={{ fontSize:16, fontWeight:700, color:"#111", marginBottom:16 }}>
              {editCard ? "기록 수정" : "새 기록 추가"}
            </div>

            <Calendar selected={formDate} onSelect={setFormDate} />

            {formDate && (
              <div style={{ fontSize:13, color:"#888", marginBottom:12, textAlign:"center" }}>
                📅 {formatDate(formDate)}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
              onChange={handleFileChange} style={{ display:"none" }} />

            {/* 수정 시 기존 파일 목록 */}
            {editCard && editCard.files.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:"#aaa", marginBottom:8 }}>기존 파일 (×로 개별 삭제)</div>
                <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                  {editCard.files.map((src, i) => {
                    const isVideo = editCard.fileTypes?.[i] === "video";
                    return (
                      <div key={i} style={{ position:"relative", flexShrink:0 }}>
                        {isVideo ? (
                          <video src={src} style={{ width:72, height:72, objectFit:"cover", borderRadius:10 }} />
                        ) : (
                          <img src={src} alt="" style={{ width:72, height:72, objectFit:"cover", borderRadius:10 }} />
                        )}
                        <button onClick={() => {
                          const newFiles = editCard.files.filter((_,j) => j!==i);
                          const newTypes = (editCard.fileTypes || editCard.files.map(()=>"photo")).filter((_,j) => j!==i);
                          setEditCard(prev => ({ ...prev, files: newFiles, fileTypes: newTypes }));
                        }}
                          style={{
                            position:"absolute", top:-6, right:-6,
                            width:20, height:20, borderRadius:"50%",
                            background:"#e74c3c", border:"none", color:"#fff",
                            fontSize:12, cursor:"pointer",
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={() => fileInputRef.current.click()}
              style={{
                width:"100%", padding:"14px", borderRadius:12,
                border:"2px dashed #ddd", background:"#fff",
                fontSize:14, color:"#888", cursor:"pointer", marginBottom:12,
                boxSizing:"border-box",
              }}>
              📷 사진 &nbsp;/&nbsp; 🎬 동영상 추가
            </button>

            {/* 새로 추가한 파일 */}
            {formFiles.length > 0 && (
              <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:12, paddingBottom:4 }}>
                {formFiles.map((f, i) => (
                  <div key={i} style={{ position:"relative", flexShrink:0 }}>
                    {f.type === "video" ? (
                      <video src={f.url} style={{ width:72, height:72, objectFit:"cover", borderRadius:10 }} />
                    ) : (
                      <img src={f.url} alt="" style={{ width:72, height:72, objectFit:"cover", borderRadius:10 }} />
                    )}
                    <button onClick={() => setFormFiles(prev => prev.filter((_,j) => j!==i))}
                      style={{
                        position:"absolute", top:-6, right:-6,
                        width:20, height:20, borderRadius:"50%",
                        background:"#333", border:"none", color:"#fff",
                        fontSize:12, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={formMemo}
              onChange={e => setFormMemo(e.target.value)}
              placeholder="오늘의 기록을 남겨보세요..."
              rows={4}
              style={{
                width:"100%", borderRadius:12, border:"1px solid #eee",
                padding:"12px 14px", fontSize:14, lineHeight:1.7,
                fontFamily:"inherit", resize:"none", background:"#fff",
                color:"#333", outline:"none", boxSizing:"border-box", marginBottom:16,
              }}
            />

            {/* 업로드 진행바 */}
            {uploading && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>업로드 중... {uploadProgress}%</div>
                <div style={{ height:4, background:"#eee", borderRadius:2 }}>
                  <div style={{ height:4, background:"#222", borderRadius:2, width:`${uploadProgress}%`, transition:"width 0.2s" }} />
                </div>
              </div>
            )}

            <button onClick={editCard ? handleUpdate : handleSave} disabled={uploading}
              style={{
                width:"100%", padding:"15px", borderRadius:12,
                background: uploading ? "#bbb" : "#222",
                border:"none", color:"#fff",
                fontSize:15, fontWeight:600, cursor: uploading ? "default" : "pointer",
              }}>
              {uploading ? "저장 중..." : editCard ? "수정 완료" : "저장"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const navBtn = (disabled) => ({
  background:"none", border:"none",
  color: disabled ? "#ddd" : "#555",
  fontSize:30, cursor: disabled ? "default" : "pointer",
  padding:"2px 8px", lineHeight:1,
});

const calNavBtn = {
  background:"none", border:"none",
  color:"#555", fontSize:22,
  cursor:"pointer", padding:"2px 8px", lineHeight:1,
};

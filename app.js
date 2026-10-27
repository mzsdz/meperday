import exifr from "exifr";
import { compressImage } from "./photos.js";
import { cloud, createJournalStore, loginLinkError } from "./cloud.js";
import {
  captureTime,
  calorieSummary,
  recordedAverage,
  validateJournal,
} from "./domain.js";
(async () => {
  "use strict";
  const KEY = "meday-mvp-v02",
    DAY = ["일", "월", "화", "수", "목", "금", "토"];
  const TODAY = localDate(new Date());
  const GOALS_DEFAULT = {
    kcal: 2200,
    carb: 270,
    protein: 90,
    fat: 65,
    fiber: 25,
    calcium: 800,
    iron: 10,
    vitD: 10,
    vitC: 100,
    potassium: 3500,
    sodium: 2000,
    satFat: 20,
  };
  const NUTS = [
    ["carb", "탄수화물", "g"],
    ["protein", "단백질", "g"],
    ["fat", "지방", "g"],
    ["fiber", "식이섬유", "g"],
    ["calcium", "칼슘", "mg"],
    ["iron", "철분", "mg"],
    ["vitD", "비타민 D", "㎍"],
    ["vitC", "비타민 C", "mg"],
    ["potassium", "칼륨", "mg"],
  ];
  const WARN = [
    ["sodium", "나트륨", "mg"],
    ["satFat", "포화지방", "g"],
  ];
  const MEALS = [
    ["breakfast", "아침"],
    ["lunch", "점심"],
    ["dinner", "저녁"],
    ["snack", "간식"],
  ];
  const PRESETS = [
    {
      name: "그래놀라 80g",
      kcal: 336,
      nutrients: { carb: 54, protein: 8, fat: 10, fiber: 6 },
    },
    {
      name: "서울우유 200mL",
      kcal: 130,
      nutrients: { carb: 10, protein: 6, fat: 7, calcium: 210 },
    },
    { name: "매일두유 99.9 190mL", kcal: 95, nutrients: { protein: 9 } },
    {
      name: "닥터유 PRO 미니 단백질바",
      kcal: 125,
      nutrients: { protein: 9, carb: 12, fat: 7 },
    },
    {
      name: "햇반 렌틸콩 현미밥 190g",
      kcal: 260,
      nutrients: { protein: 11.7, fiber: 13.3 },
    },
    {
      name: "풀드포크 바비큐 썹픽 15cm",
      kcal: 550,
      nutrients: { protein: 29, carb: 59, fat: 21, fiber: 5, sodium: 1300 },
    },
    { name: "계란 1개", kcal: 75, nutrients: { protein: 6, fat: 5 } },
    { name: "사과 1개", kcal: 95, nutrients: { carb: 25, fiber: 4, vitC: 8 } },
  ];
  const MENUS = [
    {
      name: "고등어구이 + 밥 + 나물",
      kcal: "450~650",
      icon: "🐟",
      tags: ["생선", "단백질", "비타민 D"],
      nut: ["vitD", "protein"],
      family: "fresh",
      tip: "생선과 익힌 채소를 함께 먹는 조합",
    },
    {
      name: "소고기 샤브샤브",
      kcal: "400~650",
      icon: "🍲",
      tags: ["고기", "채소", "철분"],
      nut: ["iron", "protein", "potassium"],
      family: "meat",
      tip: "고기와 채소를 좋아하는 취향에 잘 맞을 수 있어",
    },
    {
      name: "제육볶음 + 쌈채소",
      kcal: "500~750",
      icon: "🥬",
      tags: ["한식", "고기", "식이섬유"],
      nut: ["protein", "fiber"],
      family: "spicy",
      tip: "익숙하게 즐겼던 매콤한 한식",
    },
    {
      name: "연어 포케",
      kcal: "450~650",
      icon: "🥗",
      tags: ["간편식", "채소", "단백질"],
      nut: ["protein", "fiber"],
      family: "fresh",
      tip: "가볍게 먹으면서 단백질을 보충할 수 있어",
    },
    {
      name: "순두부 + 계란 + 밥",
      kcal: "350~550",
      icon: "🥚",
      tags: ["한식", "부드러운 식사", "단백질"],
      nut: ["protein", "calcium"],
      family: "soft",
      tip: "속이 불편할 때는 맵지 않게 조리하는 편이 좋아",
    },
    {
      name: "닭고기 채소 덮밥",
      kcal: "450~650",
      icon: "🍗",
      tags: ["단백질", "간편식", "채소"],
      nut: ["protein", "fiber"],
      family: "meat",
      tip: "익숙한 고기 메뉴에 채소를 더한 선택",
    },
    {
      name: "비빔밥 + 계란",
      kcal: "450~650",
      icon: "🍚",
      tags: ["한식", "채소", "철분"],
      nut: ["fiber", "iron", "potassium"],
      family: "rice",
      tip: "여러 종류의 채소를 한 끼에 먹기 좋아",
    },
    {
      name: "닭죽 + 부드러운 채소",
      kcal: "300~450",
      icon: "🥣",
      tags: ["담백함", "속 편한 음식"],
      nut: ["protein"],
      family: "soft",
      tip: "늦은 저녁이나 속이 불편한 날 부담이 덜할 수 있어",
    },
    {
      name: "돼지고기 수육 + 쌈",
      kcal: "450~700",
      icon: "🥩",
      tags: ["고기", "한식", "채소"],
      nut: ["protein", "fiber"],
      family: "meat",
      tip: "기존 육류 중심 식사 취향을 살린 선택",
    },
    {
      name: "버섯 달걀 볶음밥",
      kcal: "400~550",
      icon: "🍳",
      tags: ["간편식", "채소", "단백질"],
      nut: ["protein", "fiber"],
      family: "rice",
      tip: "집에서 간단히 만들기 좋아",
    },
  ];
  function localDate(d) {
    let y = d.getFullYear(),
      m = String(d.getMonth() + 1).padStart(2, "0"),
      day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function dateObj(s) {
    return new Date(s + "T12:00:00");
  }
  function addDays(s, n) {
    let d = dateObj(s);
    d.setDate(d.getDate() + n);
    return localDate(d);
  }
  function fmtDay(s) {
    let d = dateObj(s);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY[d.getDay()]})`;
  }
  function fmtInt(n) {
    return Math.round(n).toLocaleString("ko-KR");
  }
  function uid() {
    return (
      "r" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-3)
    );
  }
  function esc(t) {
    return String(t ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function nowTime() {
    return new Date().toTimeString().slice(0, 5);
  }
  function classify() {
    let h = new Date().getHours();
    return h < 11
      ? "breakfast"
      : h < 16
        ? "lunch"
        : h < 21
          ? "dinner"
          : "snack";
  }
  function seed() {
    return {
      records: [],
      exercises: [],
      evaluations: {},
      dayEvaluations: {},
      goals: { ...GOALS_DEFAULT },
    };
  }
  let data = seed(),
    store = null,
    committed = seed(),
    busy = false,
    accountPending = false;
  {
    try {
      data = JSON.parse(localStorage.getItem(KEY)) || seed();
    } catch {
      data = seed();
    }
  }
  let selected = TODAY,
    view = "day",
    overlayOpen = false,
    recOffset = 0;
  const $ = (s) => document.querySelector(s);
  let loadedUserId = null;
  function updateViewport() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${viewport?.height || window.innerHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--viewport-top",
      `${viewport?.offsetTop || 0}px`,
    );
  }
  updateViewport();
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);
  window.addEventListener("resize", updateViewport);
  async function save() {
    if (busy) return false;
    busy = true;
    document.querySelectorAll("button").forEach((b) => {
      b.dataset.wasDisabled = b.disabled ? "1" : "0";
      b.disabled = true;
    });
    try {
      if (accountPending)
        throw Error("계정 기록을 불러오고 있어요. 잠시 후 다시 저장해 주세요.");
      if (store) {
        await store.save(data);
      } else localStorage.setItem(KEY, JSON.stringify(data));
      committed = structuredClone(data);
      return true;
    } catch (error) {
      data = structuredClone(committed);
      toast(
        error.message ||
          "저장하지 못했습니다. 연결을 확인하고 다시 저장해 주세요.",
      );
      return false;
    } finally {
      busy = false;
      document.querySelectorAll("button").forEach((b) => {
        b.disabled = b.dataset.wasDisabled === "1";
        delete b.dataset.wasDisabled;
      });
    }
  }
  function toast(str) {
    const el = $("#toast");
    el.textContent = str;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 2900);
  }
  function recordsOn(date) {
    return data.records
      .filter((r) => r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }
  function exercisesOn(date) {
    return data.exercises.filter((e) => e.date === date);
  }
  function total(rows) {
    return rows.reduce((a, r) => a + (Number(r.kcal) || 0), 0);
  }
  function totals(rows) {
    let obj = {};
    for (const [id] of [...NUTS, ...WARN]) {
      const nums = rows
        .map((r) => r.nutrients?.[id])
        .filter(
          (v) => v !== undefined && v !== null && Number.isFinite(Number(v)),
        )
        .map(Number);
      obj[id] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
    }
    return obj;
  }
  function nutString(v, unit) {
    return v === null ? "확인 불가" : `${Math.round(v * 10) / 10}${unit}`;
  }
  function pctOf(v, key) {
    let g = data.goals[key];
    return v === null || !g ? null : Math.round((v / g) * 100);
  }
  function progressRow(id, label, unit, nuts) {
    let v = nuts[id],
      pct = pctOf(v, id),
      exceed = pct !== null && pct > 100 && ["sodium", "satFat"].includes(id),
      cl = exceed ? " n-excess" : "";
    if (["sodium", "satFat"].includes(id))
      return `<div class="nutrient-row${cl}"><span class="n-name">${label}</span><span class="n-amount">${v === null ? "미확인" : Math.round(v * 10) / 10 + unit}</span><span class="muted micro">상한 ${data.goals[id]}${unit}</span><span class="n-pct">${exceed ? "초과" : "주의"}</span></div>`;
    let w = pct === null ? 0 : Math.max(0, Math.min(100, pct / 1.45));
    return `<div class="nutrient-row${cl}"><span class="n-name">${label}</span><span class="n-amount">${v === null ? "—" : (v >= 100 ? fmtInt(v) : Math.round(v * 10) / 10) + unit}</span><div class="ntrack"><div class="nfill" style="width:${w}%"></div><span class="nmarker" title="하루 기준 100%"></span></div><span class="n-pct">${pct === null ? "?" : pct + "%"}</span></div>`;
  }
  function showNutrition(rows, group = "all") {
    const nuts = totals(rows);
    let list = group === "warning" ? WARN : NUTS;
    return `<div>${list.map(([id, label, unit]) => progressRow(id, label, unit, nuts)).join("")}</div>`;
  }
  function labelForMeal(meal) {
    return MEALS.find((m) => m[0] === meal)?.[1] || "식사";
  }
  function iconFor(r) {
    return r.emoji || "🍽️";
  }
  function thumb(r) {
    return r?.photo
      ? `<img src="${r.photo}" alt="식사 사진">`
      : esc(iconFor(r || { emoji: "＋" }));
  }
  function groupRows(rows, meal) {
    return rows.filter((r) => r.meal === meal);
  }
  function renderDay() {
    const rows = recordsOn(selected),
      cal = total(rows),
      exercise = exercisesOn(selected);
    let mealHTML = MEALS.map(([meal, lab]) => {
      let rs = groupRows(rows, meal),
        k = total(rs),
        tm = rs.length ? rs[0].time : "";
      if (meal === "snack" && !rs.length) return "";
      return `<button class="meal-row" data-open-meal="${meal}"><div class="meal-label"><b>${lab}</b><span> </span></div><div class="thumb">${rs.length ? thumb(rs[0]) : "＋"}</div><div class="meal-desc"><div class="name">${rs.length ? esc(rs.map((x) => x.name).join(" · ")) : `${lab} 기록하기`}</div>${rs.length ? `<div class="kcal">${rs.some((r) => r.kcal !== null && r.kcal !== undefined) ? `약 ${fmtInt(k)} <span class="small">kcal</span>` : "열량 미확인"}</div>` : '<div class="no-data">사진을 추가해 보세요</div>'}</div><div class="chevron">›</div></button>`;
    }).join("");
    let unknownKcal = rows.some((r) => r.kcal === null || r.kcal === undefined);
    let knownKcal = rows.some((r) => r.kcal !== null && r.kcal !== undefined);
    let base = rows.length
      ? `<div class="card cal-card"><div class="eyebrow">${selected === TODAY ? "오늘까지" : "이 날"} 섭취한 칼로리</div><div class="cal-line"><div class="cal-big">${knownKcal ? fmtInt(cal) : "—"}<span> kcal${unknownKcal && knownKcal ? " + 미확인" : ""}</span></div></div><div class="hint" style="margin-top:6px">기록된 식사 기준 · 추정치 포함${unknownKcal ? " · 열량 미확인 기록 있음" : ""} <button class="text-button" id="dayEvalButton">${data.dayEvaluations[selected] ? "하루 느낌 수정" : "하루 느낌 기록 (선택)"}</button></div></div>`
      : `<div class="card cal-card"><div class="eyebrow">${selected === TODAY ? "오늘까지" : "이 날"} 섭취한 칼로리</div><div class="cal-big">— <span>kcal</span></div><div class="hint">아직 이 날의 식사 기록이 없어요</div></div>`;
    return `<div class="date-nav"><button class="ghost-date" id="goToday">${selected === TODAY ? "오늘" : "오늘로 이동"}</button><strong class="date-title">${fmtDay(selected)}</strong><div class="date-arrows"><button data-day-shift="-1" aria-label="이전 날">‹</button><button data-day-shift="1" aria-label="다음 날">›</button></div></div>${base}${!rows.length ? `<div class="card empty"><div><h3>사진 한 장이면 충분해</h3><p>나머지는 원할 때만 기록해요.</p></div><button class="button" data-add="food">사진 올리기</button></div>` : ""}<div class="section-header"><h2>식사</h2><span class="subtle">누르면 상세 기록</span></div><div class="meal-list">${mealHTML}</div><div class="section-header"><h2>운동 기록</h2><button class="text-button" data-add="exercise">+ 운동 추가</button></div>${exercise.length ? `<div class="card activity-list">${exercise.map((e) => `<button class="item-row" style="border:0;background:white;width:100%;text-align:left" data-exercise="${e.id}"><div><strong>🏃 ${esc(e.type)}</strong><small>${e.minutes ? `${e.minutes}분` : ""}${e.calories ? ` · ${e.calories}kcal(운동앱 추정)` : ""}</small></div><span>›</span></button>`).join("")}</div>` : `<button class="action-card" data-add="exercise"><span class="action-icon">⌁</span><div><strong>운동 앱 캡처 올리기</strong><small>운동 종류 · 시간 · 소모 열량 (선택)</small></div><span class="chevron" style="margin-left:auto">›</span></button>`}${rows.length ? `<div class="card nutrients-card" style="margin-top:15px"><div class="line-action"><strong>${selected === TODAY ? "오늘의 영양소" : "이 날의 영양소"}</strong><span class="muted micro">하루 기준 대비</span></div>${showNutrition(rows)}<div class="nutrient-note">검은 선 = 설정한 하루 기준 100% · 막대는 145%까지 표시<br>추정 영양정보만 합산하며, 일부 음식의 영양소는 알 수 없어요.</div></div><div class="card"><div class="line-action" style="margin-bottom:15px"><strong>주의가 필요한 항목</strong><span class="muted micro">섭취 상한과 비교</span></div>${showNutrition(rows, "warning")}<div class="nutrient-note">나트륨·포화지방은 100%를 채우는 목표가 아니라 가급적 넘지 않을 상한이에요.</div></div>` : ""}<button class="recommend-banner" id="recommendInline"><span><strong>오늘 뭐 먹지? ✨</strong><small>오늘의 영양 상태와 내 입맛을 함께 고려해요</small></span><span>›</span></button>${rows.some((r) => r.sample) ? '<p class="record-note">일부 기록은 이전 대화에서 옮긴 <b>추정치</b>예요. 수정·삭제할 수 있어요.</p>' : ""}`;
  }
  function weekStart(s) {
    let d = dateObj(s);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return localDate(d);
  }
  function renderWeek() {
    let start = weekStart(selected),
      days = Array.from({ length: 7 }, (_, i) => addDays(start, i)),
      end = days[6],
      rAll = days.flatMap(recordsOn),
      valid = days.filter((d) => calorieSummary(recordsOn(d)).value !== null),
      avg = recordedAverage(days.map(recordsOn)),
      max = Math.max(
        data.goals.kcal * 1.3,
        ...days.map((d) => total(recordsOn(d))),
      );
    const exercises = days.flatMap(exercisesOn);
    const nutrientHTML = valid.length
      ? showNutrition(
          rAll.map((r) => ({
            ...r,
            nutrients: Object.fromEntries(
              Object.entries(r.nutrients || {}).map(([k, v]) => [
                k,
                typeof v === "number" ? v / valid.length : v,
              ]),
            ),
          })),
        )
      : "";
    return `<div class="date-nav"><button class="ghost-date" id="goToday">이번 주</button><strong class="date-title">${fmtDay(start).split(" (")[0]} ~ ${fmtDay(end).split(" (")[0]}</strong><div class="date-arrows"><button data-week-shift="-7">‹</button><button data-week-shift="7">›</button></div></div><div class="summary-cards"><div class="summary-cell"><span>기록일 평균 열량</span><strong>${valid.length ? fmtInt(avg) : "—"} <span>kcal</span></strong></div><div class="summary-cell"><span>운동 기록</span><strong>${exercises.length} <span>회</span></strong></div></div><div class="section-header"><h2>이번 주 섭취 칼로리</h2><span class="subtle">열량 확인일 평균 · 부분 합계 포함</span></div><div class="card"><div class="week-chart">${days
      .map((d) => {
        let n = total(recordsOn(d)),
          is = n > 0,
          p = Math.round((n / max) * 100);
        return `<button data-past="${d}" class="bar-col" style="background:none;border:0;color:inherit"><span class="val">${is ? fmtInt(n) : "–"}</span><div class="bar-wrap"><div class="bar ${d === selected ? "on" : ""}" style="height:${is ? Math.max(7, p) : 2}%"></div></div><span class="label">${DAY[dateObj(d).getDay()]}</span></button>`;
      })
      .join(
        "",
      )}</div><div class="chart-note">빈 날과 사진만 있는 날은 0kcal가 아닙니다. 미확인 열량은 평균에서 제외하며 부분 합계가 포함될 수 있어요.</div></div><div class="section-header"><h2>일별 기록</h2><span class="subtle">날짜를 누르면 이동</span></div><div class="card">${days
      .map((d) => {
        let rr = recordsOn(d);
        return `<button class="item-row" style="width:100%;background:white;border:0;border-bottom:1px solid #eff0ed;text-align:left" data-past="${d}"><span><strong>${fmtDay(d)}</strong><small>${
          rr.length
            ? esc(
                rr
                  .slice(0, 2)
                  .map((r) => r.name)
                  .join(" · "),
              )
            : "기록 없음"
        }</small></span><strong>${calorieSummary(rr).value === null ? "열량 미확인" : fmtInt(total(rr)) + " kcal" + (calorieSummary(rr).partial ? " + 미확인" : "")}</strong></button>`;
      })
      .join(
        "",
      )}</div>${valid.length ? `<div class="section-header"><h2>주간 평균 영양소</h2><span class="subtle">기록 ${valid.length}일 기준</span></div><div class="card nutrients-card">${nutrientHTML}<p class="nutrient-note">추정/미확인 항목 포함. 기록일 평균이며 미기록 식사는 합산되지 않아요.</p></div>` : ""}`;
  }
  function renderMonth() {
    let d = dateObj(selected),
      year = d.getFullYear(),
      month = d.getMonth(),
      first = new Date(year, month, 1),
      firstWd = first.getDay(),
      len = new Date(year, month + 1, 0).getDate(),
      days = Array.from({ length: len }, (_, i) =>
        localDate(new Date(year, month, i + 1)),
      ),
      valid = days.filter((x) => calorieSummary(recordsOn(x)).value !== null),
      avg = recordedAverage(days.map(recordsOn));
    let max = Math.max(
      data.goals.kcal * 1.3,
      ...days.map((x) => total(recordsOn(x))),
    );
    let prev = Array.from(
      { length: firstWd },
      () => '<div class="day-cell empty-cell"></div>',
    ).join("");
    return `<div class="date-nav"><button class="ghost-date" id="goToday">이번 달</button><strong class="date-title">${year}년 ${month + 1}월</strong><div class="date-arrows"><button data-month-shift="-1">‹</button><button data-month-shift="1">›</button></div></div><div class="card"><div class="month-grid">${DAY.map((l) => `<span class="month-head">${l}</span>`).join("")}${prev}${days
      .map((x) => {
        let n = total(recordsOn(x));
        return `<button class="day-cell ${x === selected ? "selected" : ""}" data-past="${x}"><span class="day-num">${dateObj(x).getDate()}</span>${recordsOn(x).length ? `<span class="dot" style="background:${n > data.goals.kcal * 1.2 ? "#d98b70" : "#75ab85"}"></span>` : '<span style="height:5px"></span>'}</button>`;
      })
      .join(
        "",
      )}</div><div class="chart-note">초록 점은 식사 기록이 있는 날 · 점을 누르면 일간으로 이동</div></div><div class="summary-cards"><div class="summary-cell"><span>기록일 평균 칼로리</span><strong>${valid.length ? fmtInt(avg) : "—"} <span>kcal</span></strong></div><div class="summary-cell"><span>기록한 날</span><strong>${days.filter((x) => recordsOn(x).length).length} <span>일</span></strong></div></div><div class="section-header"><h2>한 달의 기록 흐름</h2><span class="subtle">확인된 열량만 표시</span></div><div class="card"><div class="week-chart" style="gap:2px;height:150px">${days
      .map((x) => {
        let n = total(recordsOn(x));
        return `<div class="bar-col" style="height:140px;justify-content:end;gap:0"><div class="bar-wrap" style="height:110px"><div class="bar ${x === selected ? "on" : ""}" style="width:85%;height:${n ? Math.round((n / max) * 100) : 2}%"></div></div>${dateObj(x).getDate() % 5 === 0 ? `<span class="label" style="font-size:8px">${dateObj(x).getDate()}</span>` : '<span class="label" style="font-size:8px;opacity:0">-</span>'}</div>`;
      })
      .join(
        "",
      )}</div><div class="chart-note">기록이 없는 날의 칼로리는 알 수 없어요.</div></div>`;
  }
  function render() {
    $("#main").innerHTML = accountPending
      ? '<div class="card" role="status"><h3>계정 기록 연결 중</h3><p class="disclaimer">연결이 끝나면 기록을 표시해요. 연결 오류는 상단에서 다시 연결할 수 있어요.</p></div>'
      : view === "day"
        ? renderDay()
        : view === "week"
          ? renderWeek()
          : renderMonth();
    document
      .querySelectorAll("#modeSwitch button")
      .forEach((el) =>
        el.classList.toggle("selected", el.dataset.view === view),
      );
    $("#homeBtn").classList.toggle("active", view === "day");
    $("#statsBtn").classList.toggle("active", view === "week");
    $("#calendarBtn").classList.toggle("active", view === "month");
    document
      .querySelectorAll("#modeSwitch button,.bottom-nav button,#settingsButton")
      .forEach((button) => (button.disabled = accountPending));
  }
  let priorFocus = null;
  function closeSheet() {
    priorFocus?.focus();
    overlayOpen = false;
    $("#overlay").classList.add("hidden");
    document.body.style.overflow = "";
  }
  function showLogin() {
    showSheet(
      `${head("내 기록을 계정에 보관하기", "로그인 없이도 기록할 수 있어요. 로그인하면 다른 기기에서도 이어 볼 수 있어요.")}<form id="loginForm"><div class="field"><label for="email">이메일</label><input id="email" type="email" autocomplete="email" placeholder="name@example.com" required /></div><button type="submit" class="button full">로그인 링크 받기</button><p id="authStatus" role="status"></p><p class="disclaimer">기기에 저장한 기록은 로그인 후 설정에서 가져올 수 있어요.</p><button type="button" class="button secondary full" data-close>지금은 이 기기에 기록하기</button></form>`,
    );
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"]');
      const message = $("#authStatus");
      button.disabled = true;
      message.textContent = "로그인 링크를 보내고 있어요…";
      try {
        const { error } = await cloud.auth.signInWithOtp({
          email: $("#email").value.trim(),
          options: { emailRedirectTo: location.origin },
        });
        if (error) throw error;
        message.textContent =
          "이메일을 확인해 주세요. 로그인 링크를 열면 이 앱으로 돌아옵니다. 메일이 없으면 스팸함도 확인해 주세요.";
      } catch (error) {
        message.textContent =
          "로그인 링크를 보내지 못했어요. 잠시 후 다시 시도해 주세요. 기기 기록은 계속 사용할 수 있어요.";
      } finally {
        button.disabled = false;
      }
    };
  }
  function showLoginReturnError() {
    history.replaceState(null, "", location.pathname + location.search);
    showLogin();
    $("#authStatus").textContent =
      "로그인 링크가 만료되었거나 이미 사용됐어요. 새 로그인 링크를 받아 주세요. 기기 기록은 그대로 남아 있어요.";
  }
  window.addEventListener("hashchange", () => {
    if (cloud && new URLSearchParams(location.hash.slice(1)).has("error"))
      showLoginReturnError();
  });
  function showSheet(html) {
    priorFocus = document.activeElement;
    overlayOpen = true;
    $("#overlay").classList.remove("hidden");
    $("#sheetContent").innerHTML = html;
    $("#sheet").scrollTop = 0;
    document.body.style.overflow = "hidden";
    $("#sheet").setAttribute("tabindex", "-1");
    $("#sheet").focus();
  }
  function head(name, description = "") {
    return `<div class="sheet-head"><div><h2>${name}</h2>${description ? `<div class="subtitle">${description}</div>` : ""}</div><button class="icon-btn" data-close aria-label="닫기">✕</button></div>`;
  }
  function viewMeal(date, meal) {
    selected = date;
    const rs = groupRows(recordsOn(date), meal),
      label = labelForMeal(meal),
      cal = total(rs),
      key = `${date}-${meal}`,
      ev = data.evaluations[key] || {};
    const thumbHTML = rs[0]?.photo
      ? `<img class="detail-photo" src="${rs[0].photo}" alt="${esc(label)} 사진">`
      : `<div class="detail-cover">${rs[0]?.emoji || "🍽️"}</div>`;
    let items = rs
      .map(
        (r) =>
          `<button class="item-row" style="width:100%;border:0;border-bottom:1px solid #edf0ed;background:transparent;text-align:left" data-edit="${r.id}"><span><strong>${esc(r.name)}</strong><small>${esc(r.time)} · ${r.source?.includes("AI") ? "AI 추정" : r.source === "직접 기록" ? "직접 기록" : "추정값"}</small></span><span><strong>${r.kcal == null ? "열량 미확인" : fmtInt(r.kcal) + " kcal"}</strong><small style="text-align:right">수정 ›</small></span></button>`,
      )
      .join("");
    let nuts = rs.length ? showNutrition(rs) : "";
    showSheet(
      `${head(`${label} 상세`, fmtDay(date))}${rs.length ? thumbHTML : ""}<div class="state-box"><div class="eyebrow">이 끼니의 총열량</div><div class="cal-big" style="font-size:30px">${rs.some((r) => r.kcal !== null && r.kcal !== undefined) ? fmtInt(cal) : "—"}<span> kcal</span></div>${items || '<p class="hint">아직 기록이 없어요.</p>'}<button class="button secondary full" data-add-meal="${meal}" style="margin-top:13px">＋ 음식 추가</button></div>${rs.length ? `<h3>이 끼니의 영양소 <span class="muted micro" style="font-weight:400">하루 기준 대비</span></h3><div class="state-box">${nuts}<h3>주의 항목 · 상한 대비</h3>${showNutrition(rs, "warning")}<p class="nutrient-note">아침 별도 목표가 아니라, 이 끼니가 하루 기준의 얼마를 채웠는지 표시해요.</p></div>` : ""}<h3>먹고 나서 어땠어? <span class="muted micro" style="font-weight:400">선택 기록</span></h3><div class="state-box"><div class="eyebrow" style="margin-bottom:9px">포만감</div><div class="choice-row" id="fullnessChips">${[
        ["starve", "😵 너무 배고파"],
        ["hungry", "😕 부족해"],
        ["good", "😊 적당해"],
        ["full", "😌 배불러"],
        ["stuffed", "🥴 배 터질 듯"],
      ]
        .map(
          ([k, l]) =>
            `<button class="chip ${ev.fullness === k ? "selected" : ""}" data-full="${k}">${l}</button>`,
        )
        .join(
          "",
        )}</div><div class="eyebrow" style="margin:17px 0 9px">속 상태</div><div class="choice-row" id="conditionChips">${[
        ["comfortable", "편안해"],
        ["bloated", "더부룩해"],
        ["heartburn", "속쓰림"],
        ["sleepy", "졸려"],
        ["other", "기타"],
      ]
        .map(
          ([k, l]) =>
            `<button class="chip ${ev.conditions?.includes(k) ? "selected" : ""}" data-condition="${k}">${l}</button>`,
        )
        .join(
          "",
        )}</div><div class="field" style="margin-bottom:0"><label for="experienceNote">느낌 메모 · 선택</label><textarea id="experienceNote" placeholder="비워둬도 기록은 완성돼요">${esc(ev.note || "")}</textarea></div><button class="button secondary full" id="saveEval">평가 저장</button></div>`,
    );
  }
  const manualFields = Object.fromEntries(
    [...NUTS, ...WARN].map(([id, l, u]) => [id, [l, u]]),
  );
  function detailNutrientFields(r) {
    return `<details style="margin:15px 0"><summary style="color:#5d7765;font-size:13px;cursor:pointer">＋ 영양소 수치 직접 보완하기 <span class="micro muted">선택</span></summary><p class="disclaimer">정확히 모르는 항목은 빈칸으로 둬도 돼요. 빈칸은 0이 아니에요.</p><div class="form-grid">${Object.entries(
      manualFields,
    )
      .map(
        ([k, [l, u]]) =>
          `<div class="field"><label>${l} (${u})</label><input type="number" min="0" step="any" data-nut="${k}" value="${r?.nutrients?.[k] ?? ""}" placeholder="미확인" /></div>`,
      )
      .join("")}</div></details>`;
  }
  function showFoodForm(meal = "breakfast", r = null) {
    const isEdit = !!r;
    let state = { photo: r?.photo || null, analysis: r?.analysis || null };
    const time = r?.time || "",
      date = r?.date || selected;
    showSheet(
      `${head(isEdit ? "음식 기록 수정" : "음식 기록하기", "사진 한 장으로 시작하고, 나머지는 자유롭게 채워요.")}<form id="foodForm"><div class="form-grid ${isEdit ? "" : "single-field"}"><div class="field"><label for="foodDate">날짜</label><input id="foodDate" type="date" value="${date}" required /></div>${isEdit ? `<div class="field"><label for="foodTime">식사 시간 · 선택</label><input id="foodTime" type="time" value="${time}" /></div>` : `<input id="foodTime" type="hidden" value="${time}" />`}</div><div class="field"><label for="foodMeal">구분</label><select id="foodMeal">${MEALS.map(([k, l]) => `<option value="${k}" ${meal === k ? "selected" : ""}>${l}</option>`).join("")}</select></div><label class="uploadbox" for="foodFile"><span class="big">📷</span><strong>음식 사진 선택하기</strong><small>사진 한 장만 선택해도 저장할 수 있어요</small><input id="foodFile" type="file" accept="image/*" ></label><div id="photoPreview">${state.photo ? `<img src="${state.photo}" class="upload-preview" alt="추가한 사진">` : ""}</div><button type="button" id="foodAnalyze" class="button secondary full" ${!state.photo ? "disabled" : ""}>✦ 사진 AI 분석 (서버 연결 시)</button><p id="analyzeStatus" class="disclaimer" style="margin:7px 0 13px">AI 연결이 없어도 사진과 간단한 입력만으로 기록할 수 있어요.</p><div class="field"><label for="foodName">음식 이름</label><input id="foodName" placeholder="예: 제육볶음, 밥 (사진만 저장해도 돼요)" value="${esc(r?.name || "")}" /></div><div class="field"><label for="foodKcal">먹은 양의 칼로리 · 대략도 괜찮아요</label><input id="foodKcal" type="number" min="0" max="9999" step="1" value="${r?.kcal ?? ""}" placeholder="비워두면 열량 미확인" /></div><div class="field"><label for="foodPortion">먹은 양 · 선택</label><input id="foodPortion" value="${esc(r?.portion || "")}" placeholder="예: 반 공기, 1인분 (수치는 먹은 양 기준)" /></div><details class="field"><summary style="font-size:12px;color:#788d80;cursor:pointer">자주 먹는 음식에서 선택하기 (선택)</summary><div class="choice-row" style="margin-top:9px">${PRESETS.map((p, i) => `<button class="chip" type="button" data-preset="${i}">${p.name}</button>`).join("")}</div></details>${detailNutrientFields(r)}<details style="margin-bottom:18px"><summary style="color:#798a7b;font-size:12px;cursor:pointer">식당·구매처·메모 등 더 기록하고 싶다면</summary><div class="field"><label for="foodPlace">장소 / 식당명 (선택)</label><input id="foodPlace" value="${esc(r?.place || "")}" placeholder="비워둬도 괜찮아요" /></div><div class="field"><label for="foodPrice">가격 · 선택</label><input id="foodPrice" type="number" min="0" value="${r?.price ?? ""}" /></div><div class="field"><label for="foodNote">내 메모 (선택)</label><textarea id="foodNote" placeholder="기억하고 싶은 말이 있을 때만">${esc(r?.note || "")}</textarea></div></details><div class="inline-actions"><button type="button" class="button secondary" data-close>취소</button><button type="submit" class="button">${isEdit ? "수정 저장" : "기록 저장"}</button></div>${isEdit ? '<button type="button" class="text-button" id="deleteFood" style="margin-top:9px;color:#c07165;width:100%">이 음식 기록 삭제</button>' : ""}</form>`,
    );
    bindPhotoInput({
      input: "#foodFile",
      form: "#foodForm",
      preview: "#photoPreview",
      analyze: "#foodAnalyze",
      time: "#foodTime",
      state,
    });
    const foodAnalysisForm = $("#foodForm");
    $("#foodAnalyze").addEventListener("click", async () => {
      if (!state.photo) return;
      const analyzedPhoto = state.photo;
      let b = $("#foodAnalyze");
      b.disabled = true;
      b.textContent = "사진을 분석하고 있어요…";
      $("#analyzeStatus").textContent = "사진은 분석을 위해 서버로 전송돼요.";
      try {
        let code = localStorage.getItem("meday-access-code") || "";
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-meday-code": code },
          body: JSON.stringify({ kind: "food", image: state.photo }),
        });
        let j = await res.json();
        if (!foodAnalysisForm.isConnected || state.photo !== analyzedPhoto)
          return;
        if (!res.ok) throw Error(j.error || "서버 연결 실패");
        state.analysis = j;
        $("#foodName").value = j.name || "";
        $("#foodKcal").value = j.kcal ?? "";
        Object.entries(j.nutrients || {}).forEach(([key, val]) => {
          const el = document.querySelector(`[data-nut="${key}"]`);
          if (el && typeof val === "number") el.value = val;
        });
        $("#analyzeStatus").textContent =
          "AI 추정값이 채워졌어요. 실제 먹은 양에 맞게 수정할 수 있어요.";
        toast("AI 분석 결과를 가져왔어요.");
      } catch (e) {
        if (!foodAnalysisForm.isConnected || state.photo !== analyzedPhoto)
          return;
        $("#analyzeStatus").textContent =
          (e.message || "AI 분석을 사용할 수 없어요.") +
          " · 아래에서 직접 입력하면 저장할 수 있어요.";
      } finally {
        b.disabled = false;
        b.textContent = "✦ 사진 다시 AI 분석";
      }
    });
    document.querySelectorAll("[data-preset]").forEach((b) =>
      b.addEventListener("click", async () => {
        let p = PRESETS[Number(b.dataset.preset)];
        $("#foodName").value = p.name;
        $("#foodKcal").value = p.kcal;
        document
          .querySelectorAll("[data-nut]")
          .forEach((el) => (el.value = p.nutrients[el.dataset.nut] ?? ""));
        toast("선택한 음식의 참고값을 넣었어. 양에 맞게 수정해줘.");
      }),
    );
    $("#foodForm").onsubmit = async (e) => {
      e.preventDefault();
      if (state.processing) {
        toast("사진 처리가 끝난 뒤 저장해 주세요.");
        return;
      }
      let name = $("#foodName").value.trim() || "음식 사진 (분석 전)",
        kcal =
          $("#foodKcal").value.trim() === ""
            ? null
            : Number($("#foodKcal").value);
      if (!state.photo && kcal === null && !$("#foodName").value.trim()) {
        toast("사진 또는 음식 이름을 기록해 주세요.");
        return;
      }
      if (kcal !== null && (!Number.isFinite(kcal) || kcal < 0)) {
        toast("칼로리 값을 확인해줘.");
        return;
      }
      let nutrients = {};
      document.querySelectorAll("[data-nut]").forEach((el) => {
        if (el.value.trim() !== "") {
          let val = Number(el.value);
          if (Number.isFinite(val) && val >= 0) nutrients[el.dataset.nut] = val;
        }
      });
      let obj = {
        id: r?.id || uid(),
        date: $("#foodDate").value,
        time: $("#foodTime").value,
        meal: $("#foodMeal").value,
        name,
        kcal,
        nutrients,
        photo: state.photo,
        photoPath: r?.photoPath,
        analysis: state.analysis,
        emoji: r?.emoji || "🍽️",
        source: state.analysis
          ? "AI 추정 + 사용자 확인"
          : kcal === null
            ? "사진만 기록 · 분석 전"
            : "직접 기록",
        portion: $("#foodPortion").value.trim(),
        price:
          $("#foodPrice").value === "" ? null : Number($("#foodPrice").value),
        place: $("#foodPlace")?.value.trim() || "",
        note: $("#foodNote")?.value.trim() || "",
        sample: false,
      };
      if (r) data.records = data.records.map((z) => (z.id === r.id ? obj : z));
      else data.records.push(obj);
      selected = obj.date;
      if (!(await save())) return;
      closeSheet();
      view = "day";
      render();
      toast("식사를 기록했어 ✓");
    };
    if (r)
      $("#deleteFood").onclick = async () => {
        if (!confirm("이 음식 기록을 삭제할까?")) return;
        data.records = data.records.filter((z) => z.id !== r.id);
        if (!(await save())) return;
        closeSheet();
        render();
        toast("음식 기록을 삭제했어");
      };
  }
  function bindPhotoInput({ input, form, preview, analyze, time, state }) {
    const picker = $(input),
      formEl = $(form),
      target = $(preview),
      analyzeButton = $(analyze),
      timeField = time ? $(time) : null;
    const submit = formEl.querySelector('button[type="submit"]');
    const message = document.createElement("p");
    message.className = "disclaimer";
    message.setAttribute("role", "status");
    target.after(message);
    let sequence = 0;
    picker.onchange = async () => {
      const file = picker.files[0];
      if (!file) return;
      const request = ++sequence;
      state.processing = true;
      submit.disabled = true;
      analyzeButton.disabled = true;
      message.textContent = "사진을 준비하고 있어요…";
      try {
        const [photo, tags] = await Promise.all([
          compressImage(file),
          time
            ? exifr
                .parse(file, {
                  pick: ["DateTimeOriginal"],
                  reviveValues: false,
                })
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (request !== sequence || !formEl.isConnected) return;
        state.photo = photo;
        state.analysis = null;
        if (timeField) timeField.value = captureTime(tags);
        target.innerHTML = `<img src="${photo}" class="upload-preview" alt="선택한 사진">`;
        message.textContent =
          "사진 준비 완료 · 다른 정보는 비워 두어도 저장할 수 있어요.";
      } catch (error) {
        if (request === sequence && formEl.isConnected)
          message.textContent =
            error.message || "사진을 읽지 못했어요. 다른 사진을 선택해 주세요.";
      } finally {
        if (request === sequence) {
          state.processing = false;
          if (formEl.isConnected) {
            submit.disabled = false;
            analyzeButton.disabled = !state.photo;
            picker.value = "";
          }
        }
      }
    };
  }
  function saveMealEvaluation(date, meal) {
    const key = `${date}-${meal}`,
      existing = data.evaluations[key] || {};
    let fullness = existing.fullness,
      conditions = existing.conditions || [];
    $("#fullnessChips")
      .querySelectorAll("[data-full]")
      .forEach((b) =>
        b.addEventListener("click", async () => {
          fullness = fullness === b.dataset.full ? null : b.dataset.full;
          $("#fullnessChips")
            .querySelectorAll("button")
            .forEach((x) =>
              x.classList.toggle("selected", x.dataset.full === fullness),
            );
        }),
      );
    $("#conditionChips")
      .querySelectorAll("[data-condition]")
      .forEach((b) =>
        b.addEventListener("click", async () => {
          conditions = conditions.includes(b.dataset.condition)
            ? conditions.filter((x) => x !== b.dataset.condition)
            : [...conditions, b.dataset.condition];
          b.classList.toggle("selected");
        }),
      );
    $("#saveEval").addEventListener("click", async () => {
      data.evaluations[key] = {
        fullness,
        conditions,
        note: $("#experienceNote").value.trim(),
      };
      if (!(await save())) return;
      toast("식사 후 느낌을 기록했어 ✓");
      closeSheet();
    });
  }
  function showExerciseForm(r = null) {
    let state = { photo: r?.photo || null };
    showSheet(
      `${head(r ? "운동 수정" : "운동 기록", "운동 앱 화면 캡처만 올려도 괜찮아요.")}<form id="exerciseForm"><div class="form-grid"><div class="field"><label>날짜</label><input id="exDate" type="date" value="${r?.date || selected}" required /></div><div class="field"><label>기록 시각</label><input id="exTime" type="time" value="${r?.time || ""}" /></div></div><label class="uploadbox" for="exFile"><span class="big">🏃</span><strong>운동 앱 캡처 선택</strong><small>AI 분석은 서버를 연결했을 때 사용 가능</small><input id="exFile" type="file" accept="image/*"></label><div id="exPhotoPreview">${state.photo ? `<img class="upload-preview" src="${state.photo}" alt="운동 캡처">` : ""}</div><button type="button" class="button secondary full" id="exAnalyze" ${!state.photo ? "disabled" : ""}>✦ 캡처에서 운동 정보 추출</button><p class="disclaimer" id="exStatus">운동 종류, 시간, 소모 열량은 직접 입력해도 돼요.</p><div class="field"><label>운동 종류</label><input id="exType" value="${esc(r?.type || "")}" placeholder="예: 걷기, 홈트, 골프 연습 (선택)" /></div><div class="form-grid"><div class="field"><label>운동 시간 (분)</label><input id="exMinutes" type="number" min="0" value="${r?.minutes ?? ""}" placeholder="선택" /></div><div class="field"><label>소모 열량 (kcal)</label><input id="exCalories" type="number" min="0" value="${r?.calories ?? ""}" placeholder="선택" /></div></div><div class="inline-actions"><button type="button" data-close class="button secondary">취소</button><button type="submit" class="button">저장</button></div>${r ? '<button type="button" class="text-button" id="deleteExercise" style="margin-top:9px;color:#c07165;width:100%">운동 기록 삭제</button>' : ""}</form>`,
    );
    bindPhotoInput({
      input: "#exFile",
      form: "#exerciseForm",
      preview: "#exPhotoPreview",
      analyze: "#exAnalyze",
      state,
    });
    const exerciseAnalysisForm = $("#exerciseForm");
    $("#exAnalyze").onclick = async () => {
      const analyzedPhoto = state.photo;
      const b = $("#exAnalyze");
      b.disabled = true;
      b.textContent = "캡처를 분석하고 있어요…";
      try {
        let r = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-meday-code": localStorage.getItem("meday-access-code") || "",
          },
          body: JSON.stringify({ kind: "exercise", image: state.photo }),
        });
        let j = await r.json();
        if (!exerciseAnalysisForm.isConnected || state.photo !== analyzedPhoto)
          return;
        if (!r.ok) throw Error(j.error || "연결 실패");
        $("#exType").value = j.type || "";
        $("#exMinutes").value = j.minutes ?? "";
        $("#exCalories").value = j.calories ?? "";
        $("#exStatus").textContent =
          "AI 추출값이 채워졌어요. 맞는지 확인해 주세요.";
      } catch (e) {
        if (!exerciseAnalysisForm.isConnected || state.photo !== analyzedPhoto)
          return;
        $("#exStatus").textContent =
          e.message + " · 직접 입력해도 기록할 수 있어요.";
      } finally {
        b.disabled = false;
        b.textContent = "✦ 캡처 다시 분석";
      }
    };
    $("#exerciseForm").onsubmit = async (e) => {
      e.preventDefault();
      if (state.processing) {
        toast("사진 처리가 끝난 뒤 저장해 주세요.");
        return;
      }
      let obj = {
        id: r?.id || uid(),
        date: $("#exDate").value,
        time: $("#exTime").value,
        type: $("#exType").value.trim() || "운동 캡처 (미확인)",
        minutes:
          $("#exMinutes").value === "" ? null : Number($("#exMinutes").value),
        calories:
          $("#exCalories").value === "" ? null : Number($("#exCalories").value),
        photo: state.photo,
        photoPath: r?.photoPath,
      };
      if (!state.photo && !$("#exType").value.trim()) {
        toast("캡처 또는 운동 종류를 기록해 주세요.");
        return;
      }
      if (r)
        data.exercises = data.exercises.map((x) => (x.id === r.id ? obj : x));
      else data.exercises.push(obj);
      selected = obj.date;
      if (!(await save())) return;
      closeSheet();
      view = "day";
      render();
      toast("운동 기록 저장 ✓");
    };
    if (r)
      $("#deleteExercise").onclick = async () => {
        if (!confirm("운동 기록을 삭제할까?")) return;
        data.exercises = data.exercises.filter((x) => x.id !== r.id);
        if (!(await save())) return;
        closeSheet();
        render();
        toast("삭제했어");
      };
  }
  function showDayEvaluation() {
    const ev = data.dayEvaluations[selected] || {};
    const feelings = [
      ["starve", "😵 너무 적었어"],
      ["hungry", "😕 조금 부족"],
      ["good", "😊 적당했어"],
      ["full", "😌 많이 먹었어"],
      ["stuffed", "🥴 과식했어"],
    ];
    const symptoms = [
      ["comfortable", "편안했어"],
      ["bloated", "더부룩했어"],
      ["hungry", "계속 배고팠어"],
      ["sleepy", "식후 졸렸어"],
    ];
    let fullness = ev.fullness || null,
      conditions = [...(ev.conditions || [])];
    showSheet(
      `${head("하루 식사 돌아보기", fmtDay(selected) + " · 입력하지 않아도 완성된 기록이에요.")}<h3>오늘 전체적으로 얼마나 먹은 느낌이었어?</h3><div class="choice-row" id="dfChips">${feelings.map(([k, l]) => `<button class="chip ${fullness === k ? "selected" : ""}" data-dfull="${k}">${l}</button>`).join("")}</div><h3>속이나 몸은 어땠어?</h3><div class="choice-row" id="dcChips">${symptoms.map(([k, l]) => `<button class="chip ${conditions.includes(k) ? "selected" : ""}" data-dcond="${k}">${l}</button>`).join("")}</div><div class="field"><label>자유 메모 (선택)</label><textarea id="dayNote" placeholder="예: 저녁에는 그다지 배가 고프지 않았음">${esc(ev.note || "")}</textarea></div><button id="saveDayEval" class="button full">하루 평가 저장</button>`,
    );
    $("#dfChips")
      .querySelectorAll("[data-dfull]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            fullness = b.dataset.dfull === fullness ? null : b.dataset.dfull;
            $("#dfChips")
              .querySelectorAll("button")
              .forEach((x) =>
                x.classList.toggle("selected", x.dataset.dfull === fullness),
              );
          }),
      );
    $("#dcChips")
      .querySelectorAll("[data-dcond]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            let v = b.dataset.dcond;
            conditions = conditions.includes(v)
              ? conditions.filter((x) => x !== v)
              : [...conditions, v];
            b.classList.toggle("selected");
          }),
      );
    $("#saveDayEval").onclick = async () => {
      data.dayEvaluations[selected] = {
        fullness,
        conditions,
        note: $("#dayNote").value.trim(),
      };
      if (!(await save())) return;
      closeSheet();
      render();
      toast("하루 평가를 기록했어 ✓");
    };
  }
  function viewExercise(id) {
    let r = data.exercises.find((x) => x.id === id);
    if (r) showExerciseForm(r);
  }
  function recentPreferences() {
    let rows = data.records
      .filter((r) => r.date <= TODAY)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);
    let names = rows.map((r) => r.name).join(" ");
    return {
      meat: /치킨|제육|고기|장어|풀드포크|수육|스테이크|돼지/.test(names),
      spicy: /제육|김치|육개장|매운|찌개/.test(names),
      light: /샐러드|그라놀라|그래놀라|서브웨이|두유|샌드위치/.test(names),
      recent: names,
    };
  }
  function getRecs() {
    let pref = recentPreferences(),
      n = totals(recordsOn(TODAY)),
      short = NUTS.filter(([k]) => {
        let p = pctOf(n[k], k);
        return p !== null && p < 75;
      }).map((x) => x[0]);
    let weighted = MENUS.map((m, i) => {
      let s =
        m.nut.filter((x) => short.includes(x)).length * 2 +
        (pref.meat && m.family === "meat" ? 3 : 0) +
        (pref.spicy && m.family === "spicy" ? 3 : 0) +
        (pref.light && m.family === "fresh" ? 2 : 0);
      if (
        Object.values(data.evaluations).some((e) =>
          e.conditions?.some((c) => ["bloated", "heartburn"].includes(c)),
        ) &&
        m.family === "soft"
      )
        s += 4;
      if (recOffset > 0) s += (i * 7 + recOffset * 3) % 8;
      return { ...m, score: s };
    }).sort((a, b) => b.score - a.score);
    let picked = [],
      families = new Set();
    for (let m of weighted) {
      if (!families.has(m.family)) {
        picked.push(m);
        families.add(m.family);
      }
      if (picked.length === 3) break;
    }
    return picked;
  }
  function showRecs() {
    let picks = getRecs(),
      rs = recordsOn(TODAY),
      known = rs.length > 0;
    let pref = recentPreferences();
    showSheet(
      `${head("오늘 뭐 먹지?", "기록 기반 규칙 추천 · AI 추천은 아직 연결되지 않았어요.")}<div class="state-box"><span class="eyebrow">${fmtDay(TODAY)} · 섭취 상태</span><div class="cal-big" style="font-size:28px;margin-top:6px">${calorieSummary(rs).value === null ? "열량 미확인" : fmtInt(total(rs)) + " kcal"}</div><p class="disclaimer">기록이 적거나 영양소가 미확인이라면 추천도 참고용이야.</p></div><div class="eyebrow" style="margin:15px 0 7px">추천 메뉴 3가지</div>${picks
        .map(
          (m, i) =>
            `<div class="recommend-card"><div class="headline">${m.icon} <span>${i + 1}. ${m.name}</span></div><p>${m.tip}. ${
              m.nut.some((x) => {
                let p = pctOf(totals(rs)[x], x);
                return p !== null && p < 75;
              })
                ? "기록상 덜 채워진 영양소도 고려했어."
                : ""
            }</p><div class="info"><span>약 ${m.kcal} kcal</span>${m.tags.map((t) => `<span>${t}</span>`).join("")}</div></div>`,
        )
        .join(
          "",
        )}<button class="button outline full" id="recsAgain">↻ 다른 3개 보기</button><p class="disclaimer" style="margin-top:12px">자주 먹은 음식 = 좋아하는 음식으로 확정하지 않아. 추천을 선택해도 먹은 것으로 자동 기록하지 않아.</p><div class="inline-actions"><button class="button secondary" data-close>닫기</button><button class="button" data-add="food">먹은 음식 기록</button></div>`,
    );
    $("#recsAgain").onclick = async () => {
      recOffset++;
      showRecs();
    };
  }
  function showSettings() {
    showSheet(
      `${head("설정", "입력은 최소한으로, 내가 원할 때만 자세하게.")}<h3>하루 기준량</h3><p class="disclaimer">아래 수치는 앱 화면을 위한 임시 기준이야. 의료·영양 전문가가 정한 나의 개인 처방이 아니야. 나이·성별·건강 상태에 따라 조정이 필요할 수 있어.</p><form id="goalForm"><div class="form-grid">${[["kcal", "칼로리", "kcal"], ...NUTS, ...WARN].map(([k, l, u]) => `<div class="field"><label>${l} (${u})${["sodium", "satFat"].includes(k) ? " · 상한" : ""}</label><input type="number" min="1" max="99999" step="any" data-goal="${k}" value="${data.goals[k]}" required /></div>`).join("")}</div><button class="button full" type="submit">기준량 저장</button></form><hr class="sep"><h3>내 데이터</h3><p class="disclaimer">${store ? "로그인한 계정의 비공개 서버 저장소에 보관됩니다." : "이 기기에 저장됩니다. 브라우저 데이터를 지우면 기록이 사라질 수 있어요. 다른 기기에서도 보려면 로그인해 주세요."}</p><div class="inline-actions"><button class="button secondary" id="exportData">내보내기</button><label class="button secondary" style="text-align:center;cursor:pointer">불러오기<input type="file" id="importData" accept="application/json,.json" hidden></label></div><div class="field"><label for="accessCode">AI 접근 코드 (서버에 설정한 경우에만)</label><input id="accessCode" type="password" placeholder="미설정이면 비워두세요" value="${esc(localStorage.getItem("meday-access-code") || "")}" /></div><button class="button secondary full" id="saveCode">AI 접근 코드 저장</button>${store ? '<button type="button" class="button secondary full" id="signOut">로그아웃</button>' : cloud ? '<button type="button" class="button secondary full" id="signIn">로그인해 계정에 보관하기</button>' : ""}`,
    );
    let device = null;
    try {
      device = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}
    if (
      store &&
      device &&
      (device.records?.length || device.exercises?.length)
    ) {
      $("#sheetContent").insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="button secondary full" id="importDevice">이 기기 기록 ${device.records.length + device.exercises.length}개를 계정에 가져오기</button><p class="disclaimer">계정 기록은 유지하고 기기에만 있는 기록을 추가해요.</p>`,
      );
      $("#importDevice").onclick = async () => {
        for (const kind of ["records", "exercises"]) {
          const ids = new Set(data[kind].map((row) => row.id));
          data[kind].push(...device[kind].filter((row) => !ids.has(row.id)));
        }
        data.evaluations = { ...device.evaluations, ...data.evaluations };
        data.dayEvaluations = {
          ...device.dayEvaluations,
          ...data.dayEvaluations,
        };
        if (!(await save())) return;
        localStorage.removeItem(KEY);
        closeSheet();
        render();
        toast("기기 기록을 계정에 보관했어요.");
      };
    }
    $("#goalForm").onsubmit = async (e) => {
      e.preventDefault();
      document
        .querySelectorAll("[data-goal]")
        .forEach((el) => (data.goals[el.dataset.goal] = Number(el.value)));
      if (!(await save())) return;
      closeSheet();
      render();
      toast("기준량 저장 ✓");
    };
    $("#saveCode").onclick = async () => {
      localStorage.setItem("meday-access-code", $("#accessCode").value);
      toast("접근 코드 저장 ✓");
    };
    $("#exportData").onclick = async () => {
      const backup = structuredClone(data);
      for (const row of [...backup.records, ...backup.exercises]) {
        if (row.photoPath) {
          const result = await cloud.storage
            .from("meday-photos")
            .download(row.photoPath);
          if (result.error) {
            toast("사진 백업 다운로드 실패. 다시 시도해 주세요.");
            return;
          }
          row.photo = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(result.data);
          });
          delete row.photoPath;
        }
      }
      let blob = new Blob(
        [
          JSON.stringify(
            { version: 1, exportedAt: new Date().toISOString(), data: backup },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      let a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `meday-backup-${TODAY}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    };
    $("#importData").onchange = async (e) => {
      let f = e.target.files[0];
      if (!f) return;
      try {
        let j = JSON.parse(await f.text()),
          v = j.data || j;
        if (
          !Array.isArray(v.records) ||
          !Array.isArray(v.exercises) ||
          !v.goals
        )
          throw Error("유효하지 않은 파일");
        if (!confirm("현재 기록을 백업 파일의 내용으로 교체할까?")) return;
        data = validateJournal(v);
        if (!(await save())) return;
        closeSheet();
        render();
        toast("기록을 복원했어");
      } catch (err) {
        toast("백업 파일을 확인해줘");
      }
    };
    if (store)
      $("#signOut").onclick = async () => {
        const { error } = await cloud.auth.signOut();
        if (error) {
          toast("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
          return;
        }
        location.reload();
      };
  }
  document.addEventListener("click", (e) => {
    const button = e.target.closest("button,[data-close]");
    if (!button || busy) return;
    if (button.id === "signIn") {
      showLogin();
      return;
    }
    if (button.id === "retryAccount") {
      if (
        overlayOpen &&
        !confirm("입력 중인 내용을 닫고 계정 상태를 새로 불러올까요?")
      )
        return;
      location.reload();
      return;
    }
    if (button.hasAttribute("data-close")) {
      closeSheet();
      return;
    }
    if (accountPending) {
      toast("계정 연결 후 다시 시도해 주세요.");
      return;
    }
    if (button.dataset.view) {
      view = button.dataset.view;
      render();
      return;
    }
    if (button.id === "goToday") {
      selected = TODAY;
      render();
      return;
    }
    if (button.dataset.dayShift) {
      selected = addDays(selected, Number(button.dataset.dayShift));
      render();
      return;
    }
    if (button.dataset.weekShift) {
      selected = addDays(selected, Number(button.dataset.weekShift));
      render();
      return;
    }
    if (button.dataset.monthShift) {
      let d = dateObj(selected);
      d.setDate(1);
      d.setMonth(d.getMonth() + Number(button.dataset.monthShift));
      selected = localDate(d);
      render();
      return;
    }
    if (button.dataset.past) {
      selected = button.dataset.past;
      view = "day";
      render();
      return;
    }
    if (button.dataset.openMeal) {
      let meal = button.dataset.openMeal;
      viewMeal(selected, meal);
      saveMealEvaluation(selected, meal);
      return;
    }
    if (button.dataset.addMeal) {
      showFoodForm(button.dataset.addMeal);
      return;
    }
    if (button.dataset.add === "food") {
      showFoodForm(classify());
      return;
    }
    if (button.dataset.add === "exercise") {
      showExerciseForm();
      return;
    }
    if (button.dataset.edit) {
      let r = data.records.find((x) => x.id === button.dataset.edit);
      if (r) showFoodForm(r.meal, r);
      return;
    }
    if (button.dataset.exercise) {
      viewExercise(button.dataset.exercise);
      return;
    }
    if (button.id === "recommendInline" || button.id === "recommendBtn") {
      showRecs();
      return;
    }
    if (button.id === "dayEvalButton") {
      showDayEvaluation();
      return;
    }
    if (button.id === "settingsButton") {
      showSettings();
      return;
    }
    if (button.id === "addBtn") {
      showSheet(
        `${head("무엇을 기록할까?", "기록은 한 장의 사진으로 시작해요.")}<div style="display:grid;gap:10px;margin-top:19px"><button class="action-card" data-add="food"><span class="action-icon">🍽️</span><span><strong>음식 사진</strong><small>시간 · 칼로리 · 영양소</small></span><span class="chevron" style="margin-left:auto">›</span></button><button class="action-card" data-add="exercise"><span class="action-icon">🏃</span><span><strong>운동 앱 캡처</strong><small>운동 종류 · 시간 · 소모 열량</small></span><span class="chevron" style="margin-left:auto">›</span></button></div>`,
      );
      return;
    }
    if (button.id === "homeBtn") {
      view = "day";
      selected = TODAY;
      render();
      return;
    }
    if (button.id === "statsBtn") {
      view = "week";
      render();
      return;
    }
    if (button.id === "calendarBtn") {
      view = "month";
      render();
      return;
    }
  });
  $("#overlay").addEventListener("click", (e) => {
    if (e.target.id === "overlay") closeSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayOpen) closeSheet();
    if (e.key === "Tab" && overlayOpen) {
      const items = Array.from(
        $("#sheet").querySelectorAll(
          "button:not(:disabled),input:not([type=hidden]),select,textarea",
        ),
      ).filter((x) => x.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  async function start() {
    const status = document.createElement("div");
    status.id = "storageStatus";
    status.className = "storage-status";
    document.querySelector(".topbar").after(status);
    if (!cloud) {
      status.textContent = "로컬 모드 · 이 브라우저에 저장";
      committed = structuredClone(data);
      render();
      return;
    }
    committed = structuredClone(data);
    accountPending = true;
    render();
    status.textContent = "계정 연결 확인 중…";
    const { data: auth, error } = await cloud.auth.getSession();
    if (error && !loginLinkError) throw error;
    loadedUserId = auth.session?.user.id || null;
    if (!auth.session) {
      accountPending = false;
      render();
      status.innerHTML =
        '<span>이 기기에 저장 · 계정 동기화 꺼짐</span><button type="button" id="signIn" class="text-button">로그인</button>';
      if (loginLinkError) {
        showLoginReturnError();
      }
      return;
    }
    const connectedStore = createJournalStore(cloud, auth.session.user.id);
    data = (await connectedStore.load()) || seed();
    store = connectedStore;
    accountPending = false;
    committed = structuredClone(data);
    status.textContent = "내 계정 · 서버 저장";
    closeSheet();
    render();
    // Refresh expiring private image URLs when idle; do not replace an open form.
    setInterval(
      async () => {
        if (busy || overlayOpen) return;
        try {
          const fresh = await store.load();
          if (fresh) {
            data = fresh;
            committed = structuredClone(data);
            render();
          }
        } catch {
          status.textContent = "연결 확인 필요 · 새로고침해 주세요.";
        }
      },
      45 * 60 * 1000,
    );
  }
  try {
    await start();
    if (cloud) {
      let changeQueued = false;
      cloud.auth.onAuthStateChange((event, session) => {
        if (
          event === "INITIAL_SESSION" ||
          (session?.user.id || null) === loadedUserId ||
          changeQueued
        )
          return;
        changeQueued = true;
        accountPending = true;
        // Do not call Auth APIs from inside the synchronous Auth callback.
        setTimeout(() => {
          if (!session || loadedUserId) {
            data = seed();
            store = null;
            closeSheet();
            render();
            location.reload();
            return;
          }
          if (!busy && !overlayOpen) {
            location.reload();
            return;
          }
          $("#storageStatus").innerHTML =
            '<span>다른 탭에서 로그인했어요</span><button id="retryAccount" type="button" class="text-button">계정 변경 적용</button>';
          toast(
            "입력 중인 내용은 유지했어요. 저장 전 계정 변경을 적용해 주세요.",
          );
        }, 0);
      });
    }
  } catch (error) {
    accountPending = true;
    $("#storageStatus").innerHTML =
      '<span>계정 연결을 확인해 주세요</span><button type="button" id="retryAccount" class="text-button">다시 연결</button>';
    render();
    toast(
      "계정 기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 연결해 주세요.",
    );
  }
})();

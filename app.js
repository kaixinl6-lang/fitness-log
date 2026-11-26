"use strict";

// Sessions live in localStorage. Each exercise stores one {reps, weight}
// object per set. This version writes every set the same; a later version
// can let those objects differ without changing the saved shape.
const STORAGE_KEY = "fitness-log.v1";

const app = document.querySelector("#app");
let db = loadDb();
let screen = { name: "home" };
let notice = "";

function loadDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return emptyDb();
    }
    parsed.units = parsed.units && typeof parsed.units === "object" ? parsed.units : {};
    return parsed;
  } catch (error) {
    return emptyDb();
  }
}

function emptyDb() {
  return { version: 1, units: {}, sessions: [] };
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function formatDate(iso) {
  const parts = iso.split("-").map(Number);
  return parts[0] + "年" + parts[1] + "月" + parts[2] + "日";
}

function formatWhen(session) {
  const parts = session.date.split("-").map(Number);
  const time = new Date(session.savedAt);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  return parts[1] + "月" + parts[2] + "日 " + hh + ":" + mm;
}

function latestSession(workoutName) {
  let found = null;
  db.sessions.forEach(function (session) {
    if (session.workoutName !== workoutName) return;
    if (!found || session.savedAt >= found.savedAt) found = session;
  });
  return found;
}

function recentWorkouts() {
  const sorted = db.sessions.slice().sort(function (a, b) {
    return b.savedAt - a.savedAt;
  });
  const seen = new Set();
  const list = [];
  sorted.forEach(function (session) {
    if (seen.has(session.workoutName)) return;
    seen.add(session.workoutName);
    list.push(session);
  });
  return list;
}

function recentSessions() {
  return db.sessions.slice().sort(function (a, b) {
    return b.savedAt - a.savedAt;
  });
}

function blankExercise() {
  return { name: "", unit: "kg", locked: false, sets: "", reps: "", weight: "" };
}

function exerciseFromSession(exercise) {
  const first = exercise.sets[0] || { reps: "", weight: "" };
  const known = db.units[exercise.name];
  return {
    name: exercise.name,
    unit: known || exercise.unit || "kg",
    locked: Boolean(known || exercise.unit),
    sets: String(exercise.sets.length || ""),
    reps: String(first.reps),
    weight: String(first.weight)
  };
}

function positiveInt(value, max) {
  const text = String(value || "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const number = Number(text);
  if (number > max) return null;
  return number;
}

function cleanWeight(value) {
  const text = String(value || "").trim();
  if (!/^(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  if (!(Number(text) > 0)) return null;
  return text;
}

function unitLabel(unit) {
  return unit === "lbs" ? "lbs" : "kg";
}

function exerciseLine(exercise) {
  const first = exercise.sets[0] || { reps: "", weight: "" };
  return exercise.name + " " + exercise.sets.length + "×" + first.reps + " " + first.weight + " " + unitLabel(exercise.unit);
}

function el(tag, options) {
  const node = document.createElement(tag);
  const opts = options || {};
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  Object.keys(opts.attrs || {}).forEach(function (key) {
    node.setAttribute(key, opts.attrs[key]);
  });
  Object.keys(opts.props || {}).forEach(function (key) {
    node[key] = opts.props[key];
  });
  (opts.children || []).forEach(function (child) {
    if (child != null && child !== false) node.append(child);
  });
  return node;
}

function showError(message) {
  const node = app.querySelector("[data-error]");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
}

function render() {
  app.replaceChildren(screen.name === "editor" ? editorView() : homeView());
  if (screen.name === "editor") bindEditor();
  else bindHome();
}

function homeView() {
  const workouts = recentWorkouts();
  const sessions = recentSessions();
  const children = [
    el("img", { class: "icon", attrs: { src: "apple-touch-icon.png", width: "48", height: "48", alt: "" } }),
    el("h1", { text: "健身记录" }),
    el("p", { class: "lead", text: "下次只改变动的重量，其他沿用上次。" }),
    el("form", {
      attrs: { id: "start-form" },
      children: [
        el("label", {
          class: "field",
          children: [
            el("span", { text: "训练名称" }),
            el("input", {
              attrs: { type: "text", id: "workout-name", placeholder: "例如 上肢综训", maxlength: "40", autocomplete: "off" }
            })
          ]
        }),
        el("p", { class: "error", attrs: { "data-error": "1" }, props: { hidden: true } }),
        el("button", { class: "primary", attrs: { type: "submit" }, text: "开始训练" })
      ]
    })
  ];

  if (notice) children.push(el("p", { class: "notice", text: notice }));

  if (workouts.length) {
    children.push(el("p", { class: "section-label", text: "沿用上次训练" }));
    workouts.forEach(function (session) {
      children.push(el("button", {
        class: "workout-button",
        attrs: { type: "button", "data-workout": session.workoutName },
        children: [
          el("strong", { text: session.workoutName }),
          el("span", { class: "sub", text: "沿用上次 · " + formatWhen(session) })
        ]
      }));
    });
  }

  if (sessions.length) {
    children.push(el("p", { class: "section-label", text: "最近记录" }));
    sessions.forEach(function (session) {
      children.push(historyCard(session));
    });
  }

  return el("div", { children: children });
}

function historyCard(session) {
  return el("article", {
    class: "card history",
    children: [
      el("h2", { text: session.workoutName }),
      el("p", { class: "when", text: formatWhen(session) }),
      el("ul", {
        class: "lines",
        children: session.exercises.map(function (exercise) {
          return el("li", { text: exerciseLine(exercise) });
        })
      })
    ]
  });
}

function editorView() {
  const children = [
    el("button", { class: "back", attrs: { type: "button", "data-back": "1" }, text: "返回" }),
    el("h1", { text: screen.workoutName }),
    el("p", { class: "date-line", text: "今天 · " + formatDate(screen.date) })
  ];
  if (screen.prefilled) {
    children.push(el("p", { class: "hint", text: "已填入上次的动作和重量。" }));
  }
  screen.exercises.forEach(function (exercise, index) {
    children.push(exerciseCard(exercise, index));
  });
  children.push(el("button", { class: "secondary", attrs: { type: "button", "data-add": "1" }, text: "添加动作" }));
  children.push(el("div", {
    class: "save-bar",
    children: [
      el("p", { class: "error", attrs: { "data-error": "1" }, props: { hidden: true } }),
      el("button", { class: "primary", attrs: { type: "button", "data-save": "1" }, text: "保存本次训练" })
    ]
  }));
  return el("div", { class: "editor", children: children });
}

function exerciseCard(exercise, index) {
  return el("article", {
    class: "card",
    attrs: { "data-exercise": String(index) },
    children: [
      el("div", {
        class: "card-head",
        children: [
          el("h2", { text: "动作 " + (index + 1) }),
          el("button", { class: "remove", attrs: { type: "button", "data-remove": "1" }, text: "删除" })
        ]
      }),
      el("label", {
        class: "field",
        children: [
          el("span", { text: "动作名称" }),
          el("input", {
            attrs: {
              type: "text",
              "data-field": "name",
              placeholder: "例如 卧推",
              maxlength: "40",
              autocomplete: "off"
            },
            props: { value: exercise.name }
          })
        ]
      }),
      el("div", {
        class: "unit-row",
        children: [unitButton("kg", "公斤 kg", exercise), unitButton("lbs", "磅 lbs", exercise)]
      }),
      exercise.locked ? el("p", { class: "unit-note", text: "单位已记住，之后都用这个" }) : null,
      el("div", {
        class: "metrics",
        children: [
          metricField("组数", "sets", exercise.sets, "3", "numeric"),
          metricField("次数", "reps", exercise.reps, "8", "numeric"),
          metricField("重量", "weight", exercise.weight, "20", "decimal")
        ]
      })
    ]
  });
}

function unitButton(unit, label, exercise) {
  const selected = exercise.unit === unit;
  return el("button", {
    class: "unit-option" + (selected ? " is-selected" : ""),
    attrs: { type: "button", "data-unit": unit, "aria-pressed": selected ? "true" : "false" },
    props: { disabled: Boolean(exercise.locked && !selected) },
    text: label
  });
}

function metricField(label, field, value, placeholder, mode) {
  return el("label", {
    class: "metric",
    children: [
      el("span", { text: label }),
      el("input", {
        attrs: {
          type: "text",
          "data-field": field,
          inputmode: mode,
          placeholder: placeholder,
          maxlength: field === "weight" ? "8" : "3",
          autocomplete: "off",
          spellcheck: "false"
        },
        props: { value: value }
      })
    ]
  });
}

function bindHome() {
  const form = document.getElementById("start-form");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = document.getElementById("workout-name").value;
    if (!name.trim()) {
      showError("请填写训练名称");
      return;
    }
    openWorkout(name);
  });
  app.querySelectorAll("[data-workout]").forEach(function (button) {
    button.addEventListener("click", function () {
      openWorkout(button.getAttribute("data-workout"));
    });
  });
}

function openWorkout(name) {
  const workoutName = name.trim();
  const previous = latestSession(workoutName);
  notice = "";
  screen = {
    name: "editor",
    workoutName: workoutName,
    date: todayISO(),
    prefilled: Boolean(previous && previous.exercises.length),
    exercises: previous && previous.exercises.length
      ? previous.exercises.map(exerciseFromSession)
      : [blankExercise()]
  };
  render();
}

function bindEditor() {
  app.querySelector("[data-back]").addEventListener("click", function () {
    screen = { name: "home" };
    render();
  });
  app.querySelector("[data-add]").addEventListener("click", function () {
    readExercises();
    screen.exercises.push(blankExercise());
    render();
  });
  app.querySelector("[data-save]").addEventListener("click", saveSession);
  app.querySelectorAll("[data-exercise]").forEach(function (card) {
    const index = Number(card.getAttribute("data-exercise"));
    card.querySelector("[data-field=name]").addEventListener("input", function (event) {
      screen.exercises[index].name = event.target.value;
      applyRememberedUnit(screen.exercises[index]);
      paintCard(card, screen.exercises[index]);
    });
    card.querySelectorAll("[data-field]").forEach(function (input) {
      if (input.getAttribute("data-field") === "name") return;
      input.addEventListener("input", function (event) {
        screen.exercises[index][input.getAttribute("data-field")] = event.target.value;
      });
    });
    card.querySelectorAll("[data-unit]").forEach(function (button) {
      button.addEventListener("click", function () {
        const exercise = screen.exercises[index];
        if (exercise.locked) return;
        exercise.unit = button.getAttribute("data-unit");
        paintCard(card, exercise);
      });
    });
    card.querySelector("[data-remove]").addEventListener("click", function () {
      readExercises();
      screen.exercises.splice(index, 1);
      render();
    });
  });
}

function readExercises() {
  app.querySelectorAll("[data-exercise]").forEach(function (card) {
    const index = Number(card.getAttribute("data-exercise"));
    const exercise = screen.exercises[index];
    card.querySelectorAll("[data-field]").forEach(function (input) {
      exercise[input.getAttribute("data-field")] = input.value;
    });
  });
}

function applyRememberedUnit(exercise) {
  const known = db.units[exercise.name.trim()];
  if (known === "kg" || known === "lbs") {
    exercise.unit = known;
    exercise.locked = true;
    return;
  }
  exercise.locked = false;
}

function paintCard(card, exercise) {
  card.querySelectorAll("[data-unit]").forEach(function (button) {
    const selected = button.getAttribute("data-unit") === exercise.unit;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = Boolean(exercise.locked && !selected);
  });
  let note = card.querySelector(".unit-note");
  if (exercise.locked && !note) {
    note = el("p", { class: "unit-note", text: "单位已记住，之后都用这个" });
    card.querySelector(".unit-row").after(note);
  } else if (!exercise.locked && note) {
    note.remove();
  }
}

function saveSession() {
  readExercises();
  if (!screen.exercises.length) {
    showError("请至少添加一个动作");
    return;
  }
  const units = Object.assign({}, db.units);
  const exercises = [];
  for (let i = 0; i < screen.exercises.length; i += 1) {
    const item = screen.exercises[i];
    const name = item.name.trim();
    if (!name) {
      showError("请填写动作名称");
      return;
    }
    const setCount = positiveInt(item.sets, 999);
    const reps = positiveInt(item.reps, 999);
    if (!setCount || !reps) {
      showError("组数和次数要填大于 0 的整数");
      return;
    }
    const weight = cleanWeight(item.weight);
    if (!weight) {
      showError("请填写重量，例如 20 或 42.5");
      return;
    }
    let unit = item.unit === "lbs" ? "lbs" : "kg";
    if (units[name] === "kg" || units[name] === "lbs") unit = units[name];
    else units[name] = unit;
    const sets = [];
    for (let n = 0; n < setCount; n += 1) sets.push({ reps: reps, weight: weight });
    exercises.push({ name: name, unit: unit, sets: sets });
  }
  const next = {
    version: 1,
    units: units,
    sessions: db.sessions.concat([{
      id: uid(),
      workoutName: screen.workoutName,
      date: screen.date,
      savedAt: Date.now(),
      exercises: exercises
    }])
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    showError("无法保存，请检查浏览器存储是否已打开");
    return;
  }
  db = next;
  notice = "已保存今天的训练";
  screen = { name: "home" };
  render();
}

render();

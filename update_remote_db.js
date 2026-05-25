const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'db/buddhist-footprints/buddhist.db');
const db = new DatabaseSync(dbPath);

const fixedContent = `20260525 佛法與微分

微分的原理與公式
微分的核心思想是研究函數在某一點附近的「瞬間變化率」。在數學上，這定義為函數增量與自變數增量之比的極限。

1. 微分的定義公式

若函數 $f(x)$ 在點 $x$ 處可導，其導數 $f'(x)$（即微分係數）定義為：
$$f'(x) = \\lim_{\\Delta x \\to 0} \\frac{f(x + \\Delta x) - f(x)}{\\Delta x}$$
其中：
- $\\Delta x$ 是自變數的微小變化量。
- $f(x + \\Delta x) - f(x)$ 是對應的函數變化量，通常記作 $\\Delta y$。

2. 微分的記法

微分可以表示為函數的斜率或變化率：
- 萊布尼茨符號 (Leibniz notation)： $\\frac{dy}{dx}$，表示 $y$ 關於 $x$ 的變化率。
- 拉格朗日符號 (Lagrange notation)： $f'(x)$ 或 $y'$。
根據上述定義，微分量（微分形式）可寫作：
$$dy = f'(x) dx$$

這代表當 $x$ 改變極小量 $dx$ 時，$y$ 對應的近似改變量為 $dy$。

3. 常見基本導數公式表

在實際應用中，我們通常直接使用導函數公式：

| 函數類型 | 函數 $f(x)$ | 導數 $f'(x)$ |
| :--- | :--- | :--- |
| 常數 | $C$ | $0$ |
| 冪函數 | $x^n$ | $nx^{n-1}$ |
| 指數函數 | $e^x$ | $e^x$ |
| 對數函數 | $\\ln(x)$ | $\\frac{1}{x}$ |
| 三角函數 | $\\sin(x)$ | $\\cos(x)$ |
| 三角函數 | $\\cos(x)$ | $-\\sin(x)$ |

4. 運算基本規則

若 $u$ 和 $v$ 皆為 $x$ 的可導函數，則：
- 和差規則： $(u \\pm v)' = u' \\pm v'$
- 積法則 (Product Rule)： $(uv)' = u'v + uv'$
- 商法則 (Quotient Rule)： $\\left( \\frac{u}{v} \\right)' = \\frac{u'v - uv'}{v^2}$
- 連鎖律 (Chain Rule)： 若 $y = f(u)$ 且 $u = g(x)$，則 $\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}$

這些公式構成了微積分計算的基礎，幫助我們分析複雜系統的動態變化。

---
金融選擇權定價公式
在金融選擇權（Options）中，Delta ($\\Delta$) 和 Gamma ($\\Gamma$) 是衡量風險的「希臘字母」（Greeks）。它們通常透過 Black-Scholes 模型來推導。

1. Delta ($\\Delta$)：衡量方向性風險

Delta 定義為選擇權價格相對於標的資產價格的變化率。簡單來說，當標的資產價格變動 1 元時，選擇權價格預計變動多少。

計算公式

假設 $S$ 為標的價格，$K$ 為履約價，$r$ 為無風險利率，$q$ 為股息收益率，$\\sigma$ 為波動率，$T$ 為到期時間，$N(\\cdot)$ 為標準常態分配的累積機率函數，$N'(\\cdot)$ 為標準常態分配的機率密度函數。
定義 $d_1$ 為：
$$d_1 = \\frac{\\ln(S/K) + (r - q + \\sigma^2/2)T}{\\sigma\\sqrt{T}}$$
- 買權 (Call) 的 Delta: $\\Delta_{Call} = e^{-qT} N(d_1)$
- 賣權 (Put) 的 Delta: $\\Delta_{Put} = e^{-qT} (N(d_1) - 1)$

2. Gamma ($\\Gamma$)：衡量 Delta 的變化率

Gamma 定義為 Delta 相對於標的資產價格的變化率，也就是選擇權價格的「二階導數」。Gamma 用來衡量風險曝險程度。

計算公式

無論是買權還是賣權，Gamma 的公式皆相同：
$$\\Gamma = \\frac{N'(d_1) e^{-qT}}{S \\sigma \\sqrt{T}}$$
其中 $N'(d_1) = \\frac{1}{\\sqrt{2\\pi}} e^{-d_1^2/2}$。

3. 關鍵概念對照表

| 希臘字母 | 數學意義 | 市場含義 |
| :--- | :--- | :--- |
| Delta | $\\frac{\\partial V}{\\partial S}$ | 標的漲 1 元，期權價值變動的金額。 |
| Gamma | $\\frac{\\partial^2 V}{\\partial S^2}$ | 標的變動時，Delta 的敏感度。 |

實務觀點

- Delta 的特性： 價內（ITM）的買權 Delta 接近 1，價外（OTM）接近 0。
- Gamma 的特性： 當選擇權接近「價平」（ATM）且即將到期時，Gamma 會達到最大值。

---
Finite Difference Method (差分法)

1. 近似 Delta 的計算（一階導數）

Delta 是選擇權價格 $V$ 對標的價格 $S$ 的一階導數 $\\frac{\\partial V}{\\partial S}$。利用中心差分公式為：
$$\\Delta \\approx \\frac{V(S + \\Delta S) - V(S - \\Delta S)}{2 \\cdot \\Delta S}$$

2. 近似 Gamma 的計算（二階導數）

Gamma 是價格的二階導數 $\\frac{\\partial^2 V}{\\partial S^2}$。二階導數的中心差分公式為：
$$\\Gamma \\approx \\frac{V(S + \\Delta S) - 2V(S) + V(S - \\Delta S)}{(\\Delta S)^2}$$

---
佛法與微分的聯想

這是一個非常有深度且充滿洞見的聯想。將「輪迴」與「微分」連結在一起，其實觸及了佛法中對「諸行無常」與「緣起性空」的數學詮釋。

1. 瞬間的切片：微積分與無常

在微分的觀點中，我們總是在取 $\\Delta t \\to 0$ 的極限。當時間間隔縮小到趨近於零時，變化的瞬間就是那個「點」。
- 宣化上人的觀點： 「昨天是前世，明天是來生。」它將輪迴的範疇從遙遠的時空軸拉回到了「當下」。
- 微分的類比： 如果我們把生命看作一個連續的函數 $f(t)$，那麼「現在」就是函數在 $t$ 這個點上的狀態。根據微分原理，函數在這一點的變化趨勢（斜率/導數），是由過去的累積（前世/昨天）所決定的，同時也決定了未來的演化方向（來生/明天）。

2. 為什麼說輪迴很像微分？

佛法講「業力」（Karma），可以類比為函數的慣性與趨勢。
- 導數 (Derivative) 即業力： 一個人的業力，就是他過去行為在當下所形成的「微分斜率」。
- 二階導數 (Gamma/加速度) 即執著與習氣： 如果說 Delta 是當下的趨勢，那麼 Gamma（二階導數）就代表了這種趨勢改變的快慢。在佛法中，這就像是我們強烈的「習氣」或「執著」。
- 無生法忍 (極限的體悟)： 當 $\\Delta t$ 無限縮小到零，我們發現並沒有一個穩定、永恆的「自我」在變化，只有「變化」本身存在。

3. 當下的「零時間間隔」

這與微分方程 (Differential Equation) 描述系統演化的本質驚人地一致：給定當下的初始狀態與變化規則，整個未來路徑就已被鎖定。

---
金剛經與三心不可得

1. 過去心不可得 ($\\Delta t$ 已經消失)

過去是已經完成的積分累積。你無法對已經完成的過去式進行任何的「求導」或改變。

2. 未來心不可得 ($f(t + \\Delta t)$ 未知)

未來是函數演化的目標。真正的 $f(t + \\Delta t)$ 尚未發生，它是變動不居的機率雲。

3. 現在心不可得 ($\\Delta t \\to 0$ 的極限)

「現在」這個瞬間，根本沒有長度。如果你想抓住一個「現在」，你會發現它在你想抓住的瞬間，就已經滑入過去了。在極限的定義下，是空無一物的。

結語

唸佛號咒語就是讓腦意識時時都回到那個被微分的、不存在的原點。那個 $\\lim_{t \\to 0}$ 的點，就是不生不滅、不垢不淨、不增不減的。`;

const stmt = db.prepare("UPDATE essays SET content = ? WHERE id = '5236df38e9307e575200e6513199fab9'");
const info = stmt.run(fixedContent);

if (info.changes > 0) {
  console.log('Successfully updated the database on MBP.');
} else {
  console.log('Failed to find the essay with the specified ID on MBP.');
}

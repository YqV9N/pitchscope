// UI strings: [Chinese, English].
const MESSAGES = {
  'doc.title': ['PitchScope 音高仪 · 多轨音高可视化', 'PitchScope · Multi-track pitch tracker'],

  'brand.subtitle': ['音高仪 · 多轨可视化', 'Pitch tracker · multi-track'],
  'act.import': ['导入音频', 'Import audio'],
  'act.mic': ['麦克风', 'Mic'],
  'act.micOn': ['麦克风已开', 'Mic on'],
  'act.record': ['录制', 'Record'],
  'act.stopRec': ['停止 {time}', 'Stop {time}'],
  'act.demo': ['示例', 'Demo'],
  'act.lang': ['EN', '中文'],
  'act.langTitle': ['切换为 English', 'Switch to Chinese'],
  'act.settings': ['设置', 'Settings'],
  'act.demoTitle': ['生成一段示例旋律', 'Create a demo melody'],
  'act.cancel': ['取消', 'Cancel'],
  'mic.unsupported': ['浏览器不支持麦克风采集', 'This browser cannot capture audio'],
  'overview.title': ['点击跳转', 'Click to seek'],

  'empty.title': ['看见你的音高', 'See your pitch'],
  'empty.desc': [
    '导入一首歌，对着麦克风唱或演奏，<br />多条音高曲线会同时出现在屏幕上。',
    'Import a song, sing or play into the mic,<br />and watch multiple pitch lines on one screen.',
  ],
  'empty.import': ['导入音频', 'Import audio'],
  'empty.mic': ['打开麦克风', 'Open mic'],
  'empty.demo': ['先看示例', 'Try a demo'],
  'empty.hint': [
    '支持 MP3 / WAV / M4A / OGG / FLAC · 数据只在本机处理',
    'MP3 / WAV / M4A / OGG / FLAC · processed locally',
  ],

  'follow.return': ['回到当前', 'Back to live'],

  'transport.play': ['播放', 'Play'],
  'transport.pause': ['暂停', 'Pause'],
  'transport.stop': ['停止', 'Stop'],
  'transport.window': ['窗口', 'Window'],
  'transport.sec5': ['5 秒', '5 s'],
  'transport.sec10': ['10 秒', '10 s'],
  'transport.sec20': ['20 秒', '20 s'],
  'transport.sec30': ['30 秒', '30 s'],
  'transport.hint': [
    '拖动谱面调整白线位置 · 空格播放',
    'Drag the graph to move the line · Space to play',
  ],

  'side.tracks': ['音轨', 'Tracks'],
  'side.micOff': ['麦克风未开启', 'Mic off'],
  'side.micLive': ['麦克风采集中', 'Mic live'],
  'side.foot1': [
    '每条曲线对应一个音源。导入多个文件，就会得到多条线。',
    'One line per source. Import several files to get several lines.',
  ],
  'side.foot2': [
    '提示：耳机能减少麦克风收到伴奏的串音。',
    'Tip: headphones reduce backing bleed into the mic.',
  ],

  'settings.title': ['音高设置', 'Pitch settings'],
  'settings.range': ['检测音域', 'Pitch range'],
  'range.voice': ['人声 / 吉他（65–1600 Hz）', 'Voice / guitar (65–1600 Hz)'],
  'range.bass': ['低音（40–500 Hz）', 'Bass (40–500 Hz)'],
  'range.high': ['高音（180–2600 Hz）', 'High (180–2600 Hz)'],
  'range.wide': ['全音域（40–3000 Hz）', 'Full range (40–3000 Hz)'],
  'settings.sens': ['灵敏度', 'Sensitivity'],
  'sens.strict': ['严格（少一些误判）', 'Strict (fewer false notes)'],
  'sens.normal': ['标准', 'Normal'],
  'sens.loose': ['宽松（弱声也能抓）', 'Loose (catches quiet notes)'],
  'settings.lineDrag': ['拖动白线时（固定线模式）', 'When dragging the line (fixed mode)'],
  'linedrag.freeze': ['谱面冻结，音频继续', 'Freeze graph, audio continues'],
  'linedrag.scroll': ['谱面照常滚动，音频继续', 'Graph keeps scrolling, audio continues'],
  'linedrag.pause': ['谱面和音频都暂停', 'Pause graph and audio'],
  'settings.db': ['显示分贝（dBFS 电平）', 'Show level (dBFS)'],
  'settings.note': [
    '改动会立即作用于麦克风；已导入的音频会保持导入时的分析结果。',
    'Changes apply to the mic immediately; imported audio keeps its analysis until re-run.',
  ],
  'settings.reanalyze': ['按新设置重新分析已导入音频', 'Re-analyze imported audio'],
  'settings.close': ['关闭', 'Close'],

  'tp.volume': ['音量', 'Volume'],
  'tp.speed': ['倍速', 'Speed'],
  'tp.pitch': ['变速方式', 'Pitch handling'],
  'tp.keep': ['保持音高', 'Keep pitch'],
  'tp.shift': ['变调', 'Shift pitch'],
  'tp.color': ['谱面颜色', 'Line color'],
  'tp.export': ['导出这条音轨 WAV', 'Export this track as WAV'],
  'tp.note': [
    '音量、倍速、颜色立即生效；保持音高会做时间拉伸，可能有轻微颗粒感。',
    'Volume, speed and color apply immediately; keep-pitch uses time stretching and may sound grainy.',
  ],

  'kind.audio': ['音频', 'Audio'],
  'kind.live': ['实时', 'Live'],
  'kind.liveInput': ['实时输入', 'Live input'],
  'track.show': ['显示 / 隐藏', 'Show / hide'],
  'track.mute': ['静音', 'Mute'],
  'track.settings': ['音量 / 倍速 / 颜色', 'Volume / speed / color'],
  'track.remove': ['移除音轨', 'Remove track'],
  'track.removeMic': ['关闭麦克风', 'Turn mic off'],

  'mode.follow': ['跟随', 'Follow'],
  'mode.fixed': ['固定线', 'Fixed'],
  'mode.tipFixed': [
    '当前：固定白线，谱面滚动。点击切换为跟随播放',
    'Fixed line: the graph scrolls under it. Click for follow mode',
  ],
  'mode.tipFollow': [
    '当前：跟随播放。点击切换为固定白线',
    'Follow mode. Click for fixed line',
  ],
  'mode.toastFixed': [
    '固定白线：谱面从白线下滚过；拖白线只改它在屏幕上的位置',
    'Fixed line: the graph scrolls under it; dragging the line only moves it on screen',
  ],
  'mode.toastFollow': [
    '跟随播放：白线随播放前进，拖开谱面后可点「回到当前」',
    'Follow mode: the line advances with playback; pan the graph and use "Back to live"',
  ],

  'mic.off': ['麦克风已关闭', 'Microphone off'],
  'mic.denied': [
    '麦克风权限被拒绝。请在浏览器地址栏的权限设置里允许麦克风。',
    'Microphone permission denied. Allow it in the browser site settings.',
  ],
  'mic.notFound': ['没有找到可用的麦克风设备。', 'No microphone found.'],
  'mic.insecure': [
    '麦克风只能在 HTTPS 或 localhost 下使用。',
    'The microphone needs HTTPS or localhost.',
  ],
  'mic.fail': ['麦克风打开失败：{msg}', 'Could not open the mic: {msg}'],

  'rec.start': [
    '开始录制：麦克风 + 正在播放的伴奏（戴耳机可减少串音）',
    'Recording mic + playing backing (headphones reduce bleed)',
  ],
  'rec.tooShort': ['录音太短，没有保存', 'Recording too short, not saved'],
  'rec.analyzing': ['正在分析录音…', 'Analyzing recording…'],
  'rec.done': [
    '录音已生成 {n} 条音轨；点音轨右侧的滑块调节音量/倍速/颜色',
    'Recording created {n} track(s); use the sliders button on a track to adjust volume, speed and color',
  ],
  'rec.fail': ['录音处理失败：{msg}', 'Recording failed: {msg}'],
  'rec.denied': ['麦克风权限被拒绝，无法录制。', 'Mic permission denied; cannot record.'],
  'rec.insecure': ['录制需要 HTTPS 或 localhost。', 'Recording needs HTTPS or localhost.'],
  'rec.startFail': ['开始录制失败：{msg}', 'Could not start recording: {msg}'],

  'name.mic': ['麦克风', 'Microphone'],
  'name.demo': ['示例旋律（C 大调）', 'Demo melody (C major)'],
  'name.recMix': ['录音 {n} · 混音', 'Take {n} · Mix'],
  'name.recBacking': ['录音 {n} · 伴奏', 'Take {n} · Backing'],
  'name.recMic': ['录音 {n} · 麦克风', 'Take {n} · Voice'],

  'toast.needAudio': [
    '先导入音频，或点「示例」生成一段',
    'Import audio or try the demo first',
  ],
  'toast.pickFile': [
    '请选择音频文件（MP3 / WAV / M4A / OGG / FLAC）',
    'Choose an audio file (MP3 / WAV / M4A / OGG / FLAC)',
  ],
  'toast.busy': ['正在处理上一个文件，请稍候', 'Still processing the previous file'],
  'toast.cancelled': ['已取消分析', 'Analysis cancelled'],
  'toast.importFail': ['导入失败，请确认文件格式', 'Import failed; check the file format'],
  'toast.added': ['已加入「{name}」', 'Added "{name}"'],
  'toast.tip': [
    '拖动谱面滚动 · 拖动白线调整位置',
    'Drag the graph to scroll · drag the line to reposition it',
  ],
  'toast.demoReady': ['示例已生成，点播放试试', 'Demo ready — press play'],
  'toast.demoFail': ['示例生成失败', 'Could not create the demo'],
  'toast.noAudio': ['还没有导入音频', 'No audio imported yet'],
  'toast.reanalyzed': ['已按新设置更新分析结果', 'Re-analysis finished'],
  'toast.reanalyzeFail': ['重新分析失败', 'Re-analysis failed'],
  'toast.speedApplying': ['正在应用变速…', 'Applying speed…'],
  'toast.exporting': ['正在导出 WAV…', 'Exporting WAV…'],
  'toast.exported': ['WAV 已导出', 'WAV exported'],
  'toast.exportFail': ['导出失败：{msg}', 'Export failed: {msg}'],
  'toast.dbOn': ['已显示分贝电平', 'Level meters shown'],
  'toast.dbOff': ['已隐藏分贝电平', 'Level meters hidden'],
  'toast.range': ['检测音域已更新（麦克风立即生效）', 'Pitch range updated (mic applies immediately)'],
  'toast.sens': ['灵敏度已更新', 'Sensitivity updated'],
  'toast.lineDrag': ['拖动白线的方式已更新', 'Line-drag behavior updated'],

  'error.tooLarge': ['文件过大（>120MB）', 'File too large (>120 MB)'],
  'error.decode': [
    '无法解码「{name}」，请换 MP3 / WAV / M4A / OGG 格式',
    'Could not decode "{name}". Try MP3 / WAV / M4A / OGG.',
  ],
  'error.tooLong': ['音频超过 10 分钟，暂不支持', 'Audio longer than 10 minutes is not supported'],

  'progress.preparing': ['准备中…', 'Preparing…'],
  'progress.analyzing': ['正在分析 {i}/{n} · {name}', 'Analyzing {i}/{n} · {name}'],
  'progress.demo': ['正在生成示例旋律…', 'Creating demo melody…'],
  'progress.reanalyze': ['按新设置重新分析…', 'Re-analyzing with new settings…'],
  'progress.reanalyzing': ['重新分析 {i}/{n} · {name}', 'Re-analyzing {i}/{n} · {name}'],
  'progress.record': ['正在分析录音…', 'Analyzing recording…'],
  'progress.recording': ['正在分析录音 {i}/{n} · {name}', 'Analyzing recording {i}/{n} · {name}'],

  'rec.stopTitle': ['点击停止录制', 'Click to stop recording'],
  'rec.startTitle': ['录制麦克风 + 播放中的伴奏', 'Record mic + playing backing'],
  'rec.mutedOld': ['；原有音轨已静音以免重复', '; old tracks were muted to avoid doubling'],
  'export.noBlob': ['无法生成音频', 'Could not generate audio'],
  'mic.insecureBoot': [
    '麦克风需要 HTTPS 或 localhost；本地文件直接打开时只能看音频分析。',
    'The microphone needs HTTPS or localhost; opening the file directly only allows audio analysis.',
  ],

  'error.saveSettings': ['设置保存失败', 'Could not save settings'],
  'error.audioContext': ['当前浏览器不支持 Web Audio', 'This browser does not support Web Audio'],
};

export function translate(lang, key, vars) {
  const pair = MESSAGES[key];
  let text = pair ? (lang === 'en' ? pair[1] : pair[0]) : key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      text = text.split(`{${name}}`).join(String(vars[name]));
    }
  }
  return text;
}

export function hasMessage(key) {
  return Object.prototype.hasOwnProperty.call(MESSAGES, key);
}

/* البيانات التجريبية: 3 فئات كاملة بأسئلة حقيقية متدرجة الصعوبة.
   تُضاف تلقائيًا عند أول تشغيل فقط، ويمكن حذفها أو إعادتها من صفحة الإعدادات. */
(function (SJ) {
  'use strict';

  const { db, utils } = SJ;

  const SAMPLES = [
    {
      name: 'جغرافيا',
      description: 'عواصم وأنهار وبحيرات ومضائق من حول العالم.',
      color: '#10b981',
      emoji: '🌍',
      gradient: ['#065f46', '#0ea5e9'],
      questions: [
        { text: 'ما عاصمة المملكة العربية السعودية؟', answer: 'الرياض', notes: '' },
        { text: 'ما اسم النهر الذي يمر بمدينة القاهرة؟', answer: 'نهر النيل', notes: 'النيل أطول أنهار أفريقيا.' },
        { text: 'ما عاصمة أستراليا؟', answer: 'كانبرا', notes: 'إجابة شائعة خاطئة: سيدني.' },
        { text: 'ما اسم المضيق الذي يفصل بين قارتي أوروبا وأفريقيا؟', answer: 'مضيق جبل طارق', notes: 'يربط بين البحر المتوسط والمحيط الأطلسي.' },
        { text: 'ما أعمق بحيرة في العالم؟', answer: 'بحيرة بايكال', notes: 'تقع في روسيا (سيبيريا)، ويزيد عمقها على 1600 متر.' },
        { text: 'ما الدولة الوحيدة في العالم التي يمر بأراضيها خط الاستواء ومدار الجدي معًا؟', answer: 'البرازيل', notes: 'خط الاستواء يمر شمالها، ومدار الجدي قرب ساو باولو.' },
        { points: 200, text: 'ما أكبر قارات العالم مساحةً؟', answer: 'آسيا', notes: '' },
        { points: 400, text: 'ما عاصمة كندا؟', answer: 'أوتاوا', notes: 'إجابة شائعة خاطئة: تورونتو.' },
        { points: 600, text: 'ما أصغر دولة عربية مساحةً؟', answer: 'البحرين', notes: 'مساحتها نحو 780 كيلومترًا مربعًا.' },
      ],
    },
    {
      name: 'علوم',
      description: 'الفضاء والكيمياء وجسم الإنسان والاكتشافات العلمية.',
      color: '#3b82f6',
      emoji: '🔬',
      gradient: ['#114b61', '#18c6ef'],
      questions: [
        { text: 'ما الكوكب الذي يُلقَّب بالكوكب الأحمر؟', answer: 'المريخ', notes: '' },
        { text: 'ما الغاز الذي تمتصه النباتات من الهواء لتقوم بعملية البناء الضوئي؟', answer: 'ثاني أكسيد الكربون', notes: 'وتطلق الأكسجين.' },
        { text: 'ما الرمز الكيميائي لعنصر الذهب؟', answer: 'Au', notes: 'من الكلمة اللاتينية Aurum.' },
        { text: 'كم عدد عظام جسم الإنسان البالغ؟', answer: '206 عظمة', notes: 'المولود يولد بعدد أكبر يندمج بعضها مع النمو.' },
        { text: 'من العالِم الذي اكتشف البنسلين عام 1928؟', answer: 'ألكسندر فليمنغ', notes: 'عالِم بريطاني، حصل على نوبل في الطب عام 1945.' },
        { text: 'ما سرعة الضوء في الفراغ تقريبًا؟', answer: 'نحو 300 ألف كيلومتر في الثانية', notes: 'القيمة الدقيقة: 299,792 كم/ث. تُقبل الإجابة التقريبية.' },
        { points: 200, text: 'ما أقرب نجم إلى كوكب الأرض؟', answer: 'الشمس', notes: '' },
        { points: 400, text: 'ما العنصر الكيميائي الذي رمزه Fe؟', answer: 'الحديد', notes: '' },
        { points: 600, text: 'ما أكبر عضو في جسم الإنسان؟', answer: 'الجلد', notes: 'إجابة شائعة خاطئة: الكبد (أكبر عضو داخلي).' },
      ],
    },
    {
      name: 'رياضة',
      description: 'كرة القدم والأولمبياد وألعاب القوى.',
      color: '#f97316',
      emoji: '⚽',
      gradient: ['#9a3412', '#eab308'],
      questions: [
        { text: 'كم عدد لاعبي فريق كرة القدم داخل الملعب في المباراة الرسمية؟', answer: '11 لاعبًا', notes: 'بمن فيهم حارس المرمى.' },
        { text: 'في أي لعبة تُستخدم عبارة «كش ملك»؟', answer: 'الشطرنج', notes: '' },
        { text: 'كل كم سنة تُقام دورة الألعاب الأولمبية الصيفية؟', answer: 'كل 4 سنوات', notes: '' },
        { text: 'ما المنتخب الذي فاز بكأس العالم لكرة القدم 2022 في قطر؟', answer: 'الأرجنتين', notes: 'فاز على فرنسا بركلات الترجيح في النهائي.' },
        { text: 'ما الدولة التي استضافت أول بطولة لكأس العالم لكرة القدم عام 1930؟', answer: 'الأوروغواي', notes: 'وفازت باللقب أيضًا.' },
        { text: 'كم تبلغ المسافة الرسمية لسباق الماراثون؟', answer: '42.195 كيلومترًا', notes: 'تُقبل الإجابة «42 كم تقريبًا».' },
        { points: 200, text: 'كم عدد لاعبي فريق كرة السلة داخل الملعب؟', answer: '5 لاعبين', notes: '' },
        { points: 400, text: 'في أي مدينة أُقيمت أول دورة ألعاب أولمبية حديثة عام 1896؟', answer: 'أثينا', notes: '' },
        { points: 600, text: 'ما المنتخب الذي فاز بأكبر عدد من بطولات كأس العالم لكرة القدم؟', answer: 'البرازيل', notes: '5 ألقاب.' },
      ],
    },
  ];

  // رسم صورة غلاف للفئة برمجيًا (تدرج لوني + رمز تعبيري) لتجنّب أي ملفات خارجية
  function drawCover({ emoji, gradient }) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 800, 600);
    g.addColorStop(0, gradient[0]);
    g.addColorStop(1, gradient[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 600);
    // دوائر زخرفية
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ffffff';
    [[120, 110, 150], [700, 520, 220], [680, 90, 70], [90, 520, 60]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.font = '260px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 30;
    ctx.fillText(emoji, 400, 300);
    return new Promise((resolve) => {
      canvas.toBlob((b) => {
        if (b && b.type === 'image/webp') resolve(b);
        else canvas.toBlob((j) => resolve(j), 'image/jpeg', 0.88);
      }, 'image/webp', 0.88);
    });
  }

  // تثبيت الفئات التجريبية غير الموجودة (بالاسم)، ويعيد عدد ما أُضيف
  async function install() {
    const existing = await db.getAll('categories');
    let added = 0;
    for (const sample of SAMPLES) {
      if (existing.some((c) => utils.nameKey(c.name) === utils.nameKey(sample.name))) continue;
      const blob = await drawCover(sample);
      const imageId = utils.uid('img');
      const pendingImages = new Map([[imageId, blob]]);
      await SJ.repo.Categories.saveBundle({
        category: { name: sample.name, description: sample.description, color: sample.color, image: imageId, isActive: true },
        // الأسئلة الستة الأولى مرتبة 200، 200، 400، 400، 600، 600 والإضافية تحدد نقاطها بنفسها
        questions: sample.questions.map((q, i) => Object.assign({ points: SJ.engine.POINTS_BY_ORDER[i + 1], image: null, answerImage: null }, q)),
        pendingImages,
        isSample: true,
      });
      added++;
    }
    return added;
  }

  async function ensureInitial() {
    const meta = await db.get('kv', 'meta');
    if (meta && meta.value && meta.value.seeded) return;
    await install();
    await db.put('kv', { key: 'meta', value: { seeded: true, seededAt: Date.now() } });
  }

  // حذف كل الفئات التجريبية (إن لم تكن مستخدمة في مباراة جارية)
  async function removeAll() {
    const samples = (await db.getAll('categories')).filter((c) => c.isSample);
    for (const c of samples) await SJ.repo.Categories.remove(c.id);
    return samples.length;
  }

  async function count() {
    return (await db.getAll('categories')).filter((c) => c.isSample).length;
  }

  SJ.seed = { install, ensureInitial, removeAll, count, SAMPLES };
})(window.SJ);

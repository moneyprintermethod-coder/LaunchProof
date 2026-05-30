const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { db, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

init();

const TIERS = {
  free: {
    name: 'Free',
    price_monthly: 0,
    price_annual: 0,
    features: {
      max_projects: 1,
      max_signups: 100,
      referrals: true,
      validation_questions: true,
      price_ab_testing: false,
      custom_domain: false,
      webhooks: false,
      api_access: false,
      multi_language: false,
      csv_export: false,
      priority_support: false
    }
  },
  builder: {
    name: 'Builder',
    price_monthly: 19,
    price_annual: 149,
    features: {
      max_projects: 3,
      max_signups: 2500,
      referrals: true,
      validation_questions: true,
      price_ab_testing: true,
      custom_domain: true,
      webhooks: false,
      api_access: false,
      multi_language: false,
      csv_export: true,
      priority_support: false
    }
  },
  founder: {
    name: 'Founder',
    price_monthly: 49,
    price_annual: 399,
    features: {
      max_projects: 999,
      max_signups: 999999,
      referrals: true,
      validation_questions: true,
      price_ab_testing: true,
      custom_domain: true,
      webhooks: true,
      api_access: true,
      multi_language: true,
      csv_export: true,
      priority_support: true
    }
  }
};

const questionTemplates = [
  {
    id: 'problem_severity',
    question: 'How often does this problem frustrate you?',
    type: 'scale_1_5',
    options: ['1', '2', '3', '4', '5'],
    required: true
  },
  {
    id: 'willingness_to_pay',
    question: 'What would you pay per month for this?',
    type: 'willingness_to_pay',
    options: ['0', '9', '19', '39', '99'],
    required: true
  },
  {
    id: 'alternatives',
    question: 'What do you use today to solve this?',
    type: 'short_text',
    options: [],
    required: true
  },
  {
    id: 'urgency',
    question: 'When would you need this?',
    type: 'multiple_choice',
    options: ['Now', 'In 3 months', 'In 6 months', 'Just exploring'],
    required: true
  }
];

const normalizeSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const generateCopy = (idea) => {
  const name = idea
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    name: name || 'LaunchProof Project',
    headline: `${idea}. Build early signal, not just a waitlist.`,
    subheadline: `Validate whether customers will buy ${idea.toLowerCase()}.`,
    cta_text: 'Join the waitlist',
    og_image: `https://dummyimage.com/1200x630/1a202c/ffffff&text=${encodeURIComponent(name || 'LaunchProof')}`
  };
};

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const computeIntentScore = (questions, answers) => {
  const questionMap = (questions || []).reduce((acc, q) => ({ ...acc, [q.id]: q }), {});
  let score = 0;
  let maxWeight = 0;

  if (questionMap.problem_severity && answers.problem_severity) {
    const severity = parseInt(answers.problem_severity, 10) || 1;
    score += ((severity - 1) / 4) * 30;
    maxWeight += 30;
  }

  if (questionMap.willingness_to_pay) {
    const raw = parseFloat(answers.willingness_to_pay || answers.price || 0);
    const normalized = Math.min(raw / 50, 1);
    score += normalized * 40;
    maxWeight += 40;
  }

  if (questionMap.urgency && answers.urgency) {
    const urgencyMap = {
      Now: 1,
      'In 3 months': 0.7,
      'In 6 months': 0.4,
      'Just exploring': 0.1
    };
    score += (urgencyMap[answers.urgency] || 0) * 20;
    maxWeight += 20;
  }

  if (answers.referred) {
    score += 10;
    maxWeight += 10;
  }

  return Math.round(score);
};

const classifySignal = (intentScore, spamFlags) => {
  if (spamFlags) return 'spam';
  if (intentScore >= 70) return 'high';
  if (intentScore >= 40) return 'medium';
  return 'low';
};

const getVerdictRecommendation = (stats, threshold) => {
  if (stats.total_signups < threshold) {
    return { recommendation: 'keep_collecting', reasoning: `Need at least ${threshold} signups before a reliable verdict.` };
  }

  if (stats.total_signups >= 100 && stats.high_intent_pct < 15 && stats.avg_willingness_to_pay < 3) {
    return { recommendation: 'kill', reasoning: 'More than 100 signups but intent and willingness to pay remain very low.' };
  }

  if (stats.high_intent_pct >= 40 && stats.avg_willingness_to_pay >= 10 && stats.spam_pct < 20) {
    return { recommendation: 'build', reasoning: 'You have strong intent signal, healthy willingness to pay, and low spam.' };
  }

  if (stats.high_intent_pct < 20 || stats.avg_willingness_to_pay < 5) {
    return { recommendation: 'pivot', reasoning: 'There is interest, but not enough high intent or willingness to pay for this idea yet.' };
  }

  return { recommendation: 'keep_collecting', reasoning: 'The signal is still emerging; keep collecting more responses.' };
};

const computeDashboardStats = (startup, entries) => {
  const total = entries.length;
  const high = entries.filter((e) => e.signal_quality === 'high').length;
  const spam = entries.filter((e) => e.signal_quality === 'spam').length;
  const avgWtp = total ? entries.reduce((sum, e) => sum + (e.willingness_to_pay || 0), 0) / total : 0;
  const variantGroups = entries.reduce((acc, entry) => {
    const variant = entry.price_variant_shown != null ? entry.price_variant_shown : -1;
    const group = acc[variant] || { count: 0, converted: 0, price: null };
    group.count += 1;
    if (entry.converted_at_price) group.converted += 1;
    acc[variant] = group;
    return acc;
  }, {});

  let bestVariant = null;
  const variantResults = Object.entries(variantGroups)
    .filter(([key]) => key !== '-1')
    .map(([key, group]) => {
      const price = (startup.price_test_variants && startup.price_test_variants[Number(key)]) || null;
      const rate = group.count ? group.converted / group.count : 0;
      return { price, rate, count: group.count };
    });

  if (variantResults.length) {
    bestVariant = variantResults.reduce((best, current) => (current.rate > (best?.rate || -1) ? current : best), null);
  }

  const stats = {
    total_signups: total,
    high_intent_pct: total ? (high / total) * 100 : 0,
    spam_pct: total ? (spam / total) * 100 : 0,
    avg_willingness_to_pay: Number(avgWtp.toFixed(2)),
    best_price_point: bestVariant ? bestVariant.price : null,
    variant_results: variantResults,
    intent_bands: {
      high: entries.filter((e) => e.signal_quality === 'high').length,
      medium: entries.filter((e) => e.signal_quality === 'medium').length,
      low: entries.filter((e) => e.signal_quality === 'low').length,
      spam: spam
    }
  };

  const verdict = getVerdictRecommendation(stats, startup.min_signups_for_verdict || 50);
  stats.recommendation = verdict.recommendation;
  stats.reasoning = verdict.reasoning;
  return stats;
};

const normalizeQuestions = (questions) => {
  if (!Array.isArray(questions)) return [];

  return questions
    .map((item) => {
      if (typeof item === 'string') {
        return questionTemplates.find((q) => q.id === item) || questionTemplates.find((q) => q.question === item);
      }
      return item && item.id ? item : null;
    })
    .filter(Boolean);
};

const fromRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    validation_questions: normalizeQuestions(parseJson(row.validation_questions) || []),
    price_test_variants: parseJson(row.price_test_variants) || []
  };
};

const saveValidationVerdict = (startupId, stats, callback) => {
  const id = uuidv4();
  const snapshotDate = new Date().toISOString();
  db.run(
    `INSERT INTO validation_verdicts (id, startup_id, snapshot_date, total_signups, high_intent_pct, avg_willingness_to_pay, spam_pct, best_price_point, recommendation, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      startupId,
      snapshotDate,
      stats.total_signups,
      stats.high_intent_pct,
      stats.avg_willingness_to_pay,
      stats.spam_pct,
      stats.best_price_point,
      stats.recommendation,
      stats.reasoning
    ],
    callback
  );
};

const getOrCreateSubscription = (startupId, callback) => {
  db.get(`SELECT * FROM subscriptions WHERE startup_id = ?`, [startupId], (err, row) => {
    if (err) return callback(err);
    if (row) return callback(null, row);
    
    db.run(
      `INSERT INTO subscriptions (startup_id, tier, billing_period) VALUES (?, ?, ?)`,
      [startupId, 'free', null],
      (insertErr) => {
        if (insertErr) return callback(insertErr);
        db.get(`SELECT * FROM subscriptions WHERE startup_id = ?`, [startupId], callback);
      }
    );
  });
};

const getStartupWithTier = (startupId, callback) => {
  db.get(`SELECT * FROM startups WHERE id = ?`, [startupId], (err, startupRow) => {
    if (err || !startupRow) return callback(err || new Error('Startup not found'));
    db.get(`SELECT * FROM subscriptions WHERE startup_id = ?`, [startupId], (subErr, subRow) => {
      const tier = (subRow && subRow.tier) || 'free';
      const tierInfo = TIERS[tier] || TIERS.free;
      callback(null, { startup: fromRow(startupRow), subscription: subRow, tier, tierInfo });
    });
  });
};


app.get('/', (req, res) => {
  res.render('onboarding-idea');
});

app.post('/startup', (req, res) => {
  const { idea } = req.body;
  const copy = generateCopy(idea || 'A new startup idea');
  const slug = normalizeSlug(copy.name || idea || 'launchproof');
  const id = uuidv4();

  db.run(
    `INSERT INTO startups (id, slug, idea, name, headline, subheadline, cta_text, og_image, validation_questions, price_test_variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      slug,
      idea,
      copy.name,
      copy.headline,
      copy.subheadline,
      copy.cta_text,
      copy.og_image,
      JSON.stringify([questionTemplates[0], questionTemplates[1]]),
      JSON.stringify([])
    ],
    (err) => {
      if (err) {
        return res.status(500).send('Unable to create startup.');
      }
      getOrCreateSubscription(id, (subErr) => {
        if (subErr) console.warn('Failed to create subscription:', subErr);
        res.redirect(`/startup/${id}/questions`);
      });
    }
  );
});

app.get('/startup/:id/questions', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM startups WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.status(404).send('Startup not found.');
    res.render('onboarding-questions', { startup: fromRow(row), questionTemplates });
  });
});

app.post('/startup/:id/questions', (req, res) => {
  const { id } = req.params;
  const { validation_questions, price_test_variants, min_signups_for_verdict } = req.body;
  const selectedQuestionIds = validation_questions ? (Array.isArray(validation_questions) ? validation_questions : [validation_questions]) : [];
  const questions = selectedQuestionIds
    .map((id) => questionTemplates.find((question) => question.id === id))
    .filter(Boolean);
  const variants = (price_test_variants || '').split(',').map((value) => Number(value.trim())).filter((n) => !Number.isNaN(n));

  db.run(
    `UPDATE startups SET validation_questions = ?, price_test_variants = ?, min_signups_for_verdict = ? WHERE id = ?`,
    [JSON.stringify(questions), JSON.stringify(variants), Number(min_signups_for_verdict) || 50, id],
    function (err) {
      if (err) return res.status(500).send('Unable to update questions.');
      res.redirect(`/startup/${id}/live`);
    }
  );
});

app.get('/startup/:id/live', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM startups WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.status(404).send('Startup not found.');
    res.render('startup-live', { startup: fromRow(row), publicUrl: `${req.protocol}://${req.get('host')}/u/${row.slug}` });
  });
});

app.get('/u/:slug', (req, res) => {
  const { slug } = req.params;
  db.get(`SELECT * FROM startups WHERE slug = ?`, [slug], (err, row) => {
    if (err || !row) return res.status(404).send('Startup not found.');
    res.render('public-waitlist', { startup: fromRow(row), slug });
  });
});

app.post('/u/:slug/signup', (req, res) => {
  const { slug } = req.params;
  db.get(`SELECT * FROM startups WHERE slug = ?`, [slug], (err, row) => {
    if (err || !row) return res.status(404).send('Startup not found.');
    const startup = fromRow(row);
    const entryId = uuidv4();
    const email = req.body.email;
    const answers = {};
    const questionIds = (startup.validation_questions || []).map((q) => q.id);
    questionIds.forEach((id) => {
      answers[id] = req.body[id];
    });
    const priceVariantIndex = req.body.price_variant_shown != null ? Number(req.body.price_variant_shown) : null;
    const willingness = parseFloat(answers.willingness_to_pay || req.body.willingness_to_pay || '0') || 0;
    const converted = req.body.converted_at_price === 'on' ? 1 : 0;
    const intentScore = computeIntentScore(startup.validation_questions, { ...answers, willingness_to_pay: willingness, price: willingness });
    const spamFlags = 0;
    const signalQuality = classifySignal(intentScore, spamFlags);
    const fingerprintHash = req.cookies.device_fingerprint || uuidv4();

    res.cookie('device_fingerprint', fingerprintHash, { maxAge: 31536000000 });

    db.run(
      `INSERT INTO waitlist_entries (id, startup_id, email, intent_score, validation_answers, willingness_to_pay, price_variant_shown, converted_at_price, signal_quality, fingerprint_hash, ip_country, utm_source, utm_campaign) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        startup.id,
        email,
        intentScore,
        JSON.stringify(answers),
        willingness,
        priceVariantIndex,
        converted,
        signalQuality,
        fingerprintHash,
        req.ip,
        req.query.utm_source || null,
        req.query.utm_campaign || null
      ],
      (insertErr) => {
        if (insertErr) return res.status(500).send('Unable to submit waitlist signup.');
        res.redirect(`/u/${slug}/thanks`);
      }
    );
  });
});

app.get('/u/:slug/thanks', (req, res) => {
  const { slug } = req.params;
  db.get(`SELECT * FROM startups WHERE slug = ?`, [slug], (err, row) => {
    if (err || !row) return res.status(404).send('Startup not found.');
    res.render('thank-you', { startup: fromRow(row) });
  });
});

app.get('/startup/:id/dashboard', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM startups WHERE id = ?`, [id], (err, startupRow) => {
    if (err || !startupRow) return res.status(404).send('Startup not found.');
    db.all(`SELECT * FROM waitlist_entries WHERE startup_id = ? ORDER BY created_at DESC`, [id], (entriesErr, rows) => {
      if (entriesErr) return res.status(500).send('Unable to load dashboard.');
      const entries = rows.map((row) => ({
        ...row,
        validation_answers: parseJson(row.validation_answers) || [],
        willingness_to_pay: Number(row.willingness_to_pay),
        price_variant_shown: Number(row.price_variant_shown),
        converted_at_price: Boolean(row.converted_at_price)
      }));
      const stats = computeDashboardStats(fromRow(startupRow), entries);
      saveValidationVerdict(id, stats, (saveErr) => {
        if (saveErr) console.warn('Unable to save validation verdict snapshot.', saveErr);
        res.render('dashboard', { startup: fromRow(startupRow), stats, entries });
      });
    });
  });
});

app.get('/pricing', (req, res) => {
  res.render('pricing', { tiers: TIERS });
});

app.get('/startup/:id/settings', (req, res) => {
  const { id } = req.params;
  getStartupWithTier(id, (err, data) => {
    if (err) return res.status(404).send('Startup not found.');
    res.render('settings', { startup: data.startup, subscription: data.subscription, tier: data.tier, tierInfo: data.tierInfo, allTiers: TIERS, query: req.query });
  });
});

app.post('/startup/:id/upgrade', (req, res) => {
  const { id } = req.params;
  const { tier, billing_period } = req.body;
  
  if (!TIERS[tier]) return res.status(400).send('Invalid tier.');
  
  db.run(
    `UPDATE subscriptions SET tier = ?, billing_period = ? WHERE startup_id = ?`,
    [tier, billing_period, id],
    (err) => {
      if (err) return res.status(500).send('Unable to update subscription.');
      res.redirect(`/startup/${id}/settings?upgraded=1`);
    }
  );
});

app.get('/startup/:id/export', (req, res) => {
  const { id } = req.params;
  getStartupWithTier(id, (err, data) => {
    if (err || !data.tierInfo.features.csv_export) {
      return res.status(403).send('CSV export is not available on your tier.');
    }
    
    db.all(`SELECT email, intent_score, signal_quality, willingness_to_pay FROM waitlist_entries WHERE startup_id = ? AND signal_quality = 'high' ORDER BY intent_score DESC`, [id], (queryErr, rows) => {
      if (queryErr) return res.status(500).send('Unable to export data.');
      
      const csv = ['Email,Intent Score,Willingness to Pay'].concat(rows.map((r) => `${r.email},${r.intent_score},${r.willingness_to_pay}`)).join('\n');
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="high-intent-signups.csv"');
      res.send(csv);
    });
  });
});

app.use((req, res) => {
  res.status(404).send('Page not found.');
});

app.listen(PORT, () => {
  console.log(`LaunchProof prototype running at http://localhost:${PORT}`);
});

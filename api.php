<?php
/* =========================================================================
   Event Leaderboard — tiny JSON-file API
   -------------------------------------------------------------------------
   GET  api.php                 -> returns { events, participants }  (public)
   POST api.php?action=verify   -> checks admin password             (auth)
   POST api.php                 -> saves { data: {...} }              (auth)

   Data is stored in data.json next to this file. No database required.
   The admin password lives in config.php.
   ========================================================================= */

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

if (defined('ALLOWED_ORIGIN') && ALLOWED_ORIGIN !== '') {
  header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
  header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$DATA_FILE = __DIR__ . '/data.json';

/* ---- Seed used the very first time, before data.json exists ---- */
$SAMPLE = array(
  'events' => array('Hackathon 2026', 'AI Innovation Challenge', 'Robotics Cup'),
  'participants' => array(
    array('id'=>'p1',  'name'=>'Nova Coders',      'org'=>'MIT',             'event'=>'Hackathon 2026',          'score'=>980, 'image'=>''),
    array('id'=>'p2',  'name'=>'Byte Force',       'org'=>'Stanford',        'event'=>'Hackathon 2026',          'score'=>945, 'image'=>''),
    array('id'=>'p3',  'name'=>'Quantum Squad',    'org'=>'Carnegie Mellon', 'event'=>'Hackathon 2026',          'score'=>920, 'image'=>''),
    array('id'=>'p4',  'name'=>'Pixel Pirates',    'org'=>'UC Berkeley',     'event'=>'Hackathon 2026',          'score'=>870, 'image'=>''),
    array('id'=>'p5',  'name'=>'Debug Dynasty',    'org'=>'Georgia Tech',    'event'=>'Hackathon 2026',          'score'=>815, 'image'=>''),
    array('id'=>'p6',  'name'=>'Syntax Errors',    'org'=>'Caltech',         'event'=>'Hackathon 2026',          'score'=>760, 'image'=>''),
    array('id'=>'p7',  'name'=>'Neural Ninjas',    'org'=>'Oxford',          'event'=>'AI Innovation Challenge', 'score'=>890, 'image'=>''),
    array('id'=>'p8',  'name'=>'Deep Thinkers',    'org'=>'Cambridge',       'event'=>'AI Innovation Challenge', 'score'=>890, 'image'=>''),
    array('id'=>'p9',  'name'=>'Vector Vipers',    'org'=>'ETH Zurich',      'event'=>'AI Innovation Challenge', 'score'=>845, 'image'=>''),
    array('id'=>'p10', 'name'=>'Tensor Titans',    'org'=>'NUS',             'event'=>'AI Innovation Challenge', 'score'=>790, 'image'=>''),
    array('id'=>'p11', 'name'=>'Steel Wolves',     'org'=>'TU Munich',       'event'=>'Robotics Cup',            'score'=>720, 'image'=>''),
    array('id'=>'p12', 'name'=>'Gear Grinders',    'org'=>'KAIST',           'event'=>'Robotics Cup',            'score'=>705, 'image'=>''),
    array('id'=>'p13', 'name'=>'Circuit Breakers', 'org'=>'IIT Bombay',      'event'=>'Robotics Cup',            'score'=>680, 'image'=>'')
  )
);

function json_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function read_data($file, $sample) {
  if (!file_exists($file)) {
    @file_put_contents(
      $file,
      json_encode($sample, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
      LOCK_EX
    );
    return $sample;
  }
  $raw = file_get_contents($file);
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['events']) || !isset($data['participants'])) {
    return $sample;
  }
  return $data;
}

/* Read the request body ONCE (php://input can be finicky to read twice). */
$RAW_INPUT = file_get_contents('php://input');
$PARSED = json_decode($RAW_INPUT, true);
if (!is_array($PARSED)) $PARSED = array();

/* Timing-safe password check. Accepts the password from either the custom
   header OR the JSON body, because some hosts (Hostinger, various Apache/CGI
   setups) strip non-standard request headers. */
function check_password() {
  global $PARSED;
  $given = '';
  if (isset($_SERVER['HTTP_X_ADMIN_PASSWORD']) && $_SERVER['HTTP_X_ADMIN_PASSWORD'] !== '') {
    $given = $_SERVER['HTTP_X_ADMIN_PASSWORD'];
  } elseif (isset($PARSED['password'])) {
    $given = $PARSED['password'];
  }
  return hash_equals(ADMIN_PASSWORD, (string) $given);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

/* -------------------- READ (public) -------------------- */
if ($method === 'GET') {
  json_out(read_data($DATA_FILE, $SAMPLE));
}

/* -------------------- WRITE / VERIFY (auth) -------------------- */
if ($method === 'POST') {
  if (!check_password()) {
    json_out(array('ok' => false, 'error' => 'Invalid admin password'), 401);
  }

  if ($action === 'verify') {
    json_out(array('ok' => true));
  }

  $data = isset($PARSED['data']) ? $PARSED['data'] : null;

  if (!is_array($data) || !isset($data['events']) || !isset($data['participants'])
      || !is_array($data['events']) || !is_array($data['participants'])) {
    json_out(array('ok' => false, 'error' => 'Malformed data'), 400);
  }

  /* Re-shape server-side so only known fields are ever stored. */
  $clean = array('events' => array(), 'participants' => array());

  foreach ($data['events'] as $ev) {
    $ev = trim((string) $ev);
    if ($ev !== '' && !in_array($ev, $clean['events'], true)) $clean['events'][] = $ev;
  }

  foreach ($data['participants'] as $p) {
    if (!is_array($p) || !isset($p['name'])) continue;
    $name = trim((string) $p['name']);
    if ($name === '') continue;
    $score = (isset($p['score']) && is_numeric($p['score'])) ? 0 + $p['score'] : 0;
    $clean['participants'][] = array(
      'id'    => isset($p['id']) && $p['id'] !== '' ? (string) $p['id'] : uniqid('p'),
      'name'  => $name,
      'org'   => isset($p['org'])   ? trim((string) $p['org'])   : '',
      'event' => isset($p['event']) ? trim((string) $p['event']) : '',
      'score' => $score < 0 ? 0 : $score,
      'image' => isset($p['image']) ? trim((string) $p['image']) : ''
    );
  }

  $written = @file_put_contents(
    $DATA_FILE,
    json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    LOCK_EX
  );

  if ($written === false) {
    json_out(array('ok' => false,
      'error' => 'Could not write data.json — check that the folder is writable (chmod 755 folder, 644 file).'), 500);
  }

  json_out(array('ok' => true, 'data' => $clean));
}

json_out(array('ok' => false, 'error' => 'Method not allowed'), 405);

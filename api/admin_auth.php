<?php
/**
 * NT Eleganz — Admin Authentication API
 * Gerencia autenticação e controle de acesso dos administradores do painel.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataFile = __DIR__ . '/../data/admins.json';
$vpsBaseUrl = 'https://137-131-233-254.sslip.io/nteleganz';

function getAdminUsers() {
    global $dataFile;
    if (!file_exists($dataFile)) {
        // Inicializa com contas administrativas padrão
        $defaultAdmins = [
            [
                'id' => 'adm_adriano',
                'name' => 'Adriano Tavares',
                'username' => 'adriano',
                'email' => 'adriano@nteleganz.com.br',
                'password_hash' => password_hash('Adriano@NTE2026', PASSWORD_BCRYPT),
                'role' => 'admin',
                'active' => true,
                'created_at' => date('c')
            ],
            [
                'id' => 'adm_master',
                'name' => 'Admin NT Eleganz',
                'username' => 'admin',
                'email' => 'admin@nteleganz.com.br',
                'password_hash' => password_hash('NTEleganz@2026', PASSWORD_BCRYPT),
                'role' => 'admin',
                'active' => true,
                'created_at' => date('c')
            ]
        ];
        saveAdminUsers($defaultAdmins);
        return $defaultAdmins;
    }
    $raw = @file_get_contents($dataFile);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function saveAdminUsers($admins) {
    global $dataFile;
    $dir = dirname($dataFile);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($dataFile, json_encode($admins, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// 1. LOGIN
if ($action === 'login' || ($method === 'POST' && !$action)) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) $input = $_POST;

    $identifier = trim($input['identifier'] ?? $input['email'] ?? $input['username'] ?? '');
    $password = trim($input['password'] ?? '');

    if (!$identifier || !$password) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Informe o usuário/e-mail e a senha.']);
        exit;
    }

    $admins = getAdminUsers();
    $cleanIdent = strtolower($identifier);

    foreach ($admins as $admin) {
        $matchEmail = strtolower($admin['email'] ?? '') === $cleanIdent;
        $matchUser = strtolower($admin['username'] ?? '') === $cleanIdent;

        if (($matchEmail || $matchUser) && !empty($admin['active'])) {
            if (password_verify($password, $admin['password_hash'])) {
                // Gera token de sessão seguro
                $token = bin2hex(random_bytes(32));
                
                // Salva token na sessão rápida
                $sessionFile = __DIR__ . '/../data/admin_sessions.json';
                $sessions = file_exists($sessionFile) ? json_decode(@file_get_contents($sessionFile), true) : [];
                if (!is_array($sessions)) $sessions = [];
                
                $sessions[$token] = [
                    'admin_id' => $admin['id'],
                    'name' => $admin['name'],
                    'email' => $admin['email'],
                    'role' => $admin['role'],
                    'created_at' => time(),
                    'expires_at' => time() + (86400 * 30) // 30 dias de validade
                ];
                @file_put_contents($sessionFile, json_encode($sessions, JSON_PRETTY_PRINT));

                echo json_encode([
                    'success' => true,
                    'token' => $token,
                    'user' => [
                        'id' => $admin['id'],
                        'name' => $admin['name'],
                        'email' => $admin['email'],
                        'username' => $admin['username'],
                        'role' => $admin['role']
                    ]
                ]);
                exit;
            }
        }
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'E-mail, usuário ou senha inválidos.']);
    exit;
}

// 2. VERIFY SESSION
if ($action === 'verify') {
    $token = $_GET['token'] ?? '';
    if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
    }

    if (!$token) {
        echo json_encode(['success' => false, 'valid' => false]);
        exit;
    }

    $sessionFile = __DIR__ . '/../data/admin_sessions.json';
    if (!file_exists($sessionFile)) {
        echo json_encode(['success' => false, 'valid' => false]);
        exit;
    }

    $sessions = json_decode(@file_get_contents($sessionFile), true);
    if (!isset($sessions[$token]) || $sessions[$token]['expires_at'] < time()) {
        echo json_encode(['success' => false, 'valid' => false]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'valid' => true,
        'user' => $sessions[$token]
    ]);
    exit;
}

// 3. LOGOUT
if ($action === 'logout') {
    $input = json_decode(file_get_contents('php://input'), true);
    $token = $input['token'] ?? $_GET['token'] ?? '';
    if ($token) {
        $sessionFile = __DIR__ . '/../data/admin_sessions.json';
        if (file_exists($sessionFile)) {
            $sessions = json_decode(@file_get_contents($sessionFile), true);
            if (is_array($sessions) && isset($sessions[$token])) {
                unset($sessions[$token]);
                @file_put_contents($sessionFile, json_encode($sessions, JSON_PRETTY_PRINT));
            }
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// 4. CHANGE PASSWORD
if ($action === 'change_password') {
    $input = json_decode(file_get_contents('php://input'), true);
    $identifier = trim($input['identifier'] ?? $input['email'] ?? '');
    $currentPass = trim($input['currentPassword'] ?? '');
    $newPass = trim($input['newPassword'] ?? '');

    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A nova senha deve ter no mínimo 6 caracteres.']);
        exit;
    }

    $admins = getAdminUsers();
    $found = false;
    foreach ($admins as &$admin) {
        if (strtolower($admin['email']) === strtolower($identifier) || strtolower($admin['username']) === strtolower($identifier)) {
            if (!password_verify($currentPass, $admin['password_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Senha atual incorreta.']);
                exit;
            }
            $admin['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT);
            $admin['updated_at'] = date('c');
            $found = true;
            break;
        }
    }
    unset($admin);

    if ($found) {
        saveAdminUsers($admins);
        echo json_encode(['success' => true, 'message' => 'Senha alterada com sucesso!']);
        exit;
    }

    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Administrador não encontrado.']);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Ação não encontrada.']);

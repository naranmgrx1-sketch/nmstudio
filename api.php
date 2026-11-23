<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'error' => 'Request body must be valid JSON.']);
    }

    return $data;
}

function public_user(array $user): array
{
    return [
        'id' => (string) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
    ];
}

try {
    $pdo = new PDO(
        'mysql:host=127.0.0.1;port=3306;dbname=nmstudio_db;charset=utf8mb4',
        'root',
        '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $action = isset($_GET['action']) ? (string) $_GET['action'] : '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($action === 'health' && $method === 'GET') {
        $pdo->query('SELECT 1');
        respond(200, ['success' => true, 'status' => 'ok', 'database' => 'nmstudio_db']);
    }

    if ($action === 'tracks' && $method === 'GET') {
        $rows = $pdo->query('SELECT id, title, artist, mood, source_type, audio_url, created_at FROM tracks ORDER BY created_at DESC, id DESC')->fetchAll();
        respond(200, ['success' => true, 'data' => $rows]);
    }

    if ($action === 'tracks' && $method === 'POST') {
        $data = request_data();
        $title = trim((string) ($data['title'] ?? ''));
        $artist = trim((string) ($data['artist'] ?? ''));
        if (($data['deleted'] ?? false) === true) {
            if (isset($data['id']) && ctype_digit((string) $data['id'])) {
                $statement = $pdo->prepare('DELETE FROM tracks WHERE id = ?');
                $statement->execute([(int) $data['id']]);
            } elseif ($title !== '' && $artist !== '') {
                $statement = $pdo->prepare('DELETE FROM tracks WHERE title = ? AND artist = ?');
                $statement->execute([$title, $artist]);
            }
            respond(200, ['success' => true, 'data' => ['deleted' => true]]);
        }
        $mood = trim((string) ($data['mood'] ?? ''));
        $sourceType = trim((string) ($data['source_type'] ?? ''));
        $audioUrl = trim((string) ($data['audio_url'] ?? ''));
        if ($title === '' || $artist === '') {
            respond(422, ['success' => false, 'error' => 'Track title and artist are required.']);
        }
        if (!in_array($sourceType, ['synth', 'local', 'url', 'database'], true)) {
            $sourceType = 'database';
        }

        $existing = null;
        if (isset($data['id']) && ctype_digit((string) $data['id'])) {
            $find = $pdo->prepare('SELECT id FROM tracks WHERE id = ?');
            $find->execute([(int) $data['id']]);
            $existing = $find->fetchColumn();
        }
        if ($existing === null) {
            $find = $pdo->prepare('SELECT id FROM tracks WHERE title = ? AND artist = ? ORDER BY id DESC LIMIT 1');
            $find->execute([$title, $artist]);
            $existing = $find->fetchColumn();
        }

        if ($existing !== false && $existing !== null) {
            $statement = $pdo->prepare('UPDATE tracks SET title = ?, artist = ?, mood = ?, source_type = ?, audio_url = ? WHERE id = ?');
            $statement->execute([$title, $artist, $mood, $sourceType, $audioUrl, $existing]);
            $id = $existing;
        } else {
            $statement = $pdo->prepare('INSERT INTO tracks (title, artist, mood, source_type, audio_url) VALUES (?, ?, ?, ?, ?)');
            $statement->execute([$title, $artist, $mood, $sourceType, $audioUrl]);
            $id = $pdo->lastInsertId();
        }
        respond(200, ['success' => true, 'data' => ['id' => (string) $id]]);
    }

    if ($action === 'playlists' && $method === 'GET') {
        $rows = $pdo->query('SELECT id, user_id, name, track_ids, created_at FROM playlists ORDER BY created_at DESC, id DESC')->fetchAll();
        foreach ($rows as &$row) {
            $decoded = json_decode((string) $row['track_ids'], true);
            $row['track_ids'] = is_array($decoded) ? $decoded : [];
        }
        unset($row);
        respond(200, ['success' => true, 'data' => $rows]);
    }

    if ($action === 'playlists' && $method === 'POST') {
        $data = request_data();
        $name = trim((string) ($data['name'] ?? ''));
        $trackIds = $data['track_ids'] ?? [];
        $userId = isset($data['user_id']) && ctype_digit((string) $data['user_id']) ? (int) $data['user_id'] : null;
        if (($data['deleted'] ?? false) === true) {
            if (isset($data['id']) && ctype_digit((string) $data['id'])) {
                $statement = $pdo->prepare('DELETE FROM playlists WHERE id = ?');
                $statement->execute([(int) $data['id']]);
            } elseif ($name !== '') {
                $statement = $pdo->prepare('DELETE FROM playlists WHERE name = ? AND (user_id <=> ?)');
                $statement->execute([$name, $userId]);
            }
            respond(200, ['success' => true, 'data' => ['deleted' => true]]);
        }
        if ($name === '') {
            respond(422, ['success' => false, 'error' => 'Playlist name is required.']);
        }
        if (!is_array($trackIds)) {
            respond(422, ['success' => false, 'error' => 'Playlist track_ids must be an array.']);
        }
        $encodedTrackIds = json_encode(array_values($trackIds), JSON_UNESCAPED_SLASHES);

        $existing = null;
        if (isset($data['id']) && ctype_digit((string) $data['id'])) {
            $find = $pdo->prepare('SELECT id FROM playlists WHERE id = ?');
            $find->execute([(int) $data['id']]);
            $existing = $find->fetchColumn();
        }
        if ($existing === null) {
            $find = $pdo->prepare('SELECT id FROM playlists WHERE name = ? AND (user_id <=> ?) ORDER BY id DESC LIMIT 1');
            $find->execute([$name, $userId]);
            $existing = $find->fetchColumn();
        }

        if ($existing !== false && $existing !== null) {
            $statement = $pdo->prepare('UPDATE playlists SET name = ?, track_ids = ? WHERE id = ?');
            $statement->execute([$name, $encodedTrackIds, $existing]);
            $id = $existing;
        } else {
            $statement = $pdo->prepare('INSERT INTO playlists (user_id, name, track_ids) VALUES (?, ?, ?)');
            $statement->execute([$userId, $name, $encodedTrackIds]);
            $id = $pdo->lastInsertId();
        }
        respond(200, ['success' => true, 'data' => ['id' => (string) $id]]);
    }

    if ($action === 'register' && $method === 'POST') {
        $data = request_data();
        $name = trim((string) ($data['name'] ?? ''));
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $role = ($data['role'] ?? '') === 'admin' ? 'admin' : 'customer';
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 4) {
            respond(422, ['success' => false, 'error' => 'Enter a name, valid email, and password of at least 4 characters.']);
        }
        $statement = $pdo->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
        try {
            $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $role]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                respond(409, ['success' => false, 'error' => 'An account with that email already exists.']);
            }
            throw $error;
        }
        $user = ['id' => $pdo->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => $role];
        respond(201, ['success' => true, 'data' => public_user($user)]);
    }

    if ($action === 'login' && $method === 'POST') {
        $data = request_data();
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $statement = $pdo->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $user = $statement->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            respond(401, ['success' => false, 'error' => 'That email and password do not match an account.']);
        }
        respond(200, ['success' => true, 'data' => public_user($user)]);
    }

    if (!in_array($action, ['health', 'tracks', 'playlists', 'register', 'login'], true)) {
        respond(404, ['success' => false, 'error' => 'Unknown API action.']);
    }
    header('Allow: ' . ($action === 'health' || $method === 'GET' ? 'GET' : 'GET, POST'));
    respond(405, ['success' => false, 'error' => 'This method is not allowed for the requested action.']);
} catch (Throwable $error) {
    error_log('NMStudio API error: ' . $error->getMessage());
    respond(500, ['success' => false, 'error' => 'The database request could not be completed.']);
}

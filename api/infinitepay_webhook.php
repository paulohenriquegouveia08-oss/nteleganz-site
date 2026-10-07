<?php
/**
 * NT Eleganz — Webhook de Notificações de Pagamento InfinitePay
 * Atualiza automaticamente o status do pedido para 'pago' / 'aprovado'
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$rawPayload = file_get_contents('php://input');
$payload = $rawPayload ? json_decode($rawPayload, true) : null;

// Log silencioso do evento recebido para auditoria
$logDir = __DIR__ . '/../data/logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
@file_put_contents(
    $logDir . '/infinitepay_webhooks_' . date('Y-m') . '.log',
    "[" . date('c') . "] " . ($rawPayload ?: 'EMPTY') . "\n",
    FILE_APPEND
);

if (!is_array($payload)) {
    http_response_code(200);
    echo json_encode(['status' => 'ignored']);
    exit;
}

$orderId = $payload['order_id'] ?? ($payload['orderId'] ?? ($payload['metadata']['order_id'] ?? null));
$status = strtolower((string)($payload['status'] ?? ($payload['event'] ?? '')));

// Se aprovado / pago
$isApproved = in_array($status, ['approved', 'payment_approved', 'paid', 'completed'], true);

if ($orderId && $isApproved) {
    $cleanCode = strtoupper(ltrim((string)$orderId, '#'));

    // Atualiza via API de pedidos
    $updateData = [
        'status' => 'pago',
        'paymentStatus' => 'approved',
        'paidAt' => date('c')
    ];

    $ch = curl_init("https://nteleganz.com.br/api/orders.php?code={$cleanCode}");
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_POSTFIELDS => json_encode($updateData),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json']
    ]);
    @curl_exec($ch);
    @curl_close($ch);
}

http_response_code(200);
echo json_encode(['success' => true]);

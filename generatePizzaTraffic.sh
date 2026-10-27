#!/bin/bash
# Simulates JWT Pizza traffic against the given host.
# Usage: ./generatePizzaTraffic.sh https://pizza-service.deck-network.com

if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  exit 1
fi
host=$1

# Kill all background loops on CTRL-C
cleanup() {
  echo "Terminating background processes..."
  kill $(jobs -p) 2>/dev/null
  exit 0
}
trap cleanup SIGINT

login() {
  curl -s -X PUT "$host/api/auth" -d "{\"email\":\"$1\", \"password\":\"$2\"}" -H 'Content-Type: application/json' | jq -r '.token'
}

# Request the menu every 3 seconds
while true; do
  result=$(curl -s -o /dev/null -w "%{http_code}" "$host/api/order/menu")
  echo "Requesting menu... $result"
  sleep 3
done &

# Invalid login every 25 seconds
while true; do
  result=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$host/api/auth" -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json')
  echo "Logging in with invalid credentials... $result"
  sleep 25
done &

# Franchisee logs in and out two minutes later
while true; do
  token=$(login f@jwt.com franchisee)
  echo "Login franchisee... $([ "$token" != "null" ] && [ -n "$token" ] && echo true || echo false)"
  sleep 110
  curl -s -o /dev/null -X DELETE "$host/api/auth" -H "Authorization: Bearer $token"
  echo "Logging out franchisee..."
  sleep 10
done &

# Diner logs in, buys a pizza, logs out
while true; do
  token=$(login d@jwt.com diner)
  echo "Login diner... $([ "$token" != "null" ] && [ -n "$token" ] && echo true || echo false)"
  result=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$host/api/order" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $token" \
    -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}')
  echo "Bought a pizza... $result"
  sleep 20
  curl -s -o /dev/null -X DELETE "$host/api/auth" -H "Authorization: Bearer $token"
  echo "Logging out diner..."
  sleep 30
done &

# Hungry diner orders too many pizzas (server error) every 5 minutes
while true; do
  token=$(login d@jwt.com diner)
  echo "Login hungry diner... $([ "$token" != "null" ] && [ -n "$token" ] && echo true || echo false)"
  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i < 21; i++ )); do
    items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done
  result=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$host/api/order" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer $token" \
    -d "{\"franchiseId\": 1, \"storeId\":1, \"items\":[$items]}")
  echo "Bought too many pizzas... $result"
  sleep 5
  curl -s -o /dev/null -X DELETE "$host/api/auth" -H "Authorization: Bearer $token"
  echo "Logging out hungry diner..."
  sleep 295
done &

wait

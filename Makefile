.PHONY: install start dev lint format test clean help

# Default target
help:
	@echo "Trahn Grid Trader - Available Commands"
	@echo "======================================="
	@echo "  make install    Install dependencies"
	@echo "  make start      Start the trading bot"
	@echo "  make dev        Start in development mode (watch)"
	@echo "  make lint       Check code formatting"
	@echo "  make format     Format code with Prettier"
	@echo "  make test       Run tests"
	@echo "  make clean      Clean node_modules and state"
	@echo ""

install:
	npm install

start:
	node main.js

dev:
	npm run dev

lint:
	npm run lint

format:
	npm run format

test:
	npm test

clean:
	rm -rf node_modules
	rm -f *.state.json
	@echo "Cleaned!"


.PHONY: install clean

install:
	pnpm install
	pnpm run build
	pnpm link --global

clean:
	rm -rf dist node_modules

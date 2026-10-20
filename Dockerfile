FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Copia todos os arquivos do projeto
COPY . .

# Expõe a porta padrão do servidor
EXPOSE 3000

ENV PORT=3000

CMD ["npm", "start"]

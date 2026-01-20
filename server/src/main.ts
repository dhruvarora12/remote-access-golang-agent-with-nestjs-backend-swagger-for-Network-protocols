import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ✅ Enable CORS with ngrok-compatible settings
  app.enableCors({
    origin: true, // Allow all origins dynamically
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'Accept', '*'],
    exposedHeaders: ['*'],
  });
  
  const ngrokUrl = 'https://42409defeb6f.ngrok-free.app';
  
  const config = new DocumentBuilder()
    .setTitle('Remote Access API')
    .setDescription('API for managing remote access agents and executing commands')
    .setVersion('1.0')
    .addTag('agents')
    .addServer('http://localhost:3000', 'Local Development')
    .addServer(ngrokUrl, 'Ngrok')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      requestInterceptor: (req: any) => {
        req.headers['ngrok-skip-browser-warning'] = 'true';
        return req;
      },
    },
  });
  
  const port = 3000;
  
  await app.listen(port);
  
  console.log('\n=================================');
  console.log('🚀 Server is running!');
  console.log('=================================');
  console.log(`Local Swagger:   http://localhost:${port}/api`);
  console.log(`Ngrok Swagger:   ${ngrokUrl}/api`);
  console.log('=================================\n');
}
bootstrap();
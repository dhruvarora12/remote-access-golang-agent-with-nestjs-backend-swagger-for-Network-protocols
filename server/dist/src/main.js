"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'Accept', '*'],
        exposedHeaders: ['*'],
    });
    const ngrokUrl = 'https://42409defeb6f.ngrok-free.app';
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Remote Access API')
        .setDescription('API for managing remote access agents and executing commands')
        .setVersion('1.0')
        .addTag('agents')
        .addServer('http://localhost:3000', 'Local Development')
        .addServer(ngrokUrl, 'Ngrok')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api', app, document, {
        swaggerOptions: {
            requestInterceptor: (req) => {
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
//# sourceMappingURL=main.js.map
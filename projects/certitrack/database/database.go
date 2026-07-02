package database

import (
	"certification-system/config"
	"fmt"
	"log"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect() {
	cfg := config.AppConfig

	var dsn string

	var dialector gorm.Dialector

	switch cfg.Driver {
	case "mysql":
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=Local",
			cfg.User, cfg.Pass, cfg.Host, cfg.Port, cfg.Name)
		dialector = mysql.Open(dsn)

	case "postgres":
		dsn = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
			cfg.Host, cfg.User, cfg.Pass, cfg.Name, cfg.Port)
		dialector = postgres.Open(dsn)

	default:
		log.Fatal("DB DRIVER tidak dikenali. Gunakan: mysql | postgres | sqlserver | sqlite")
	}

	database, err := gorm.Open(dialector, &gorm.Config{})

	if err != nil {
		log.Fatal("gagal koneksi ke DB:", err)
	}

	DB = database
	log.Println("Database connected:", cfg.Driver)
}

package config

import "os"

type Config struct {
	Driver string
	Host   string
	Port   string
	User   string
	Pass   string
	Name   string
}

var AppConfig Config

func LoadConfig() {
	AppConfig = Config{
		Driver: os.Getenv("DB_DRIVER"),
		Host:   os.Getenv("DB_HOST"),
		Port:   os.Getenv("DB_PORT"),
		User:   os.Getenv("DB_USER"),
		Pass:   os.Getenv("DB_PASS"),
		Name:   os.Getenv("DB_NAME"),
	}
}

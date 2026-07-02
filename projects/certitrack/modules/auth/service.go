package auth

import (
	"certification-system/modules/users"
	"certification-system/utils"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

type AuthService interface {
	Login(req LoginRequest) (*LoginResponse, error)
	Register(req RegisterRequest) (*RegisterResponse, error)
	GetUserByID(id uint) (users.User, error)
}

type authService struct {
	userService users.UserService
}

func NewAuthService(userService users.UserService) AuthService {
	return &authService{userService: userService}
}

func (s *authService) Login(req LoginRequest) (*LoginResponse, error) {
	user, err := s.userService.GetUserByUsername(req.Username)
	if err != nil {
		return nil, errors.New("username atau password salah")
	}

	if err := user.CheckPassword(req.Password); err != nil {
		return nil, errors.New("username atau password salah")
	}

	token, err := utils.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		return nil, errors.New("gagal generate token")
	}

	return &LoginResponse{
		Token:    token,
		Username: user.Username,
		Name:     user.Name,
		Role:     user.Role,
		Section:  user.Section,
	}, nil
}

func (s *authService) Register(req RegisterRequest) (*RegisterResponse, error) {
	_, err := s.userService.GetUserByUsername(req.Username)
	if err == nil {
		return nil, errors.New("username sudah digunakan")
	}

	user := &users.User{
		UUID:     uuid.New().String(),
		Username: req.Username,
		Password: req.Password,
		Name:     req.Name,
		Email:    req.Email,
		Section:  req.Section,
		Role:     "user",
	}

	if err := s.userService.CreateUser(user); err != nil {
		return nil, fmt.Errorf("gagal membuat user: %v", err)
	}

	return &RegisterResponse{
		Message:  "Registrasi berhasil",
		Username: user.Username,
	}, nil
}

func (s *authService) GetUserByID(id uint) (users.User, error) {
	return s.userService.GetUserById(id)
}

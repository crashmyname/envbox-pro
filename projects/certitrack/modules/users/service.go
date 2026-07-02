package users

import (
	"certification-system/utils"

	"github.com/google/uuid"
)

type UserService interface {
	GetAllUsers(param utils.PaginationParam) ([]User, *utils.Pagination, error)
	GetUserById(id uint) (User, error)
	GetUserByUsername(username string) (User, error)
	CreateUser(user *User) error
	UpdateUser(user *User) error
	DeleteUser(id uint) error
}

type userService struct {
	repo UserRepository
}

func NewUserService(repo UserRepository) UserService {
	return &userService{repo: repo}
}

func (s *userService) GetAllUsers(param utils.PaginationParam) ([]User, *utils.Pagination, error) {
	return s.repo.FindAll(param)
}

func (s *userService) GetUserById(id uint) (User, error) {
	return s.repo.FindById(id)
}

func (s *userService) GetUserByUsername(username string) (User, error) {
	return s.repo.FindByUsername(username)
}

func (s *userService) CreateUser(user *User) error {
	if err := user.HashPassword(); err != nil {
		return err
	}
	if user.UUID == "" {
		user.UUID = uuid.New().String()
	}
	return s.repo.Create(user)
}

func (s *userService) UpdateUser(user *User) error {
	// if user.Password != "" && !strings.HasPrefix(user.Password, "$2a$") {
	// 	if err := user.HashPassword(); err != nil {
	// 		return err
	// 	}
	// }
	return s.repo.Update(user)
}

func (s *userService) DeleteUser(id uint) error {
	return s.repo.Delete(id)
}

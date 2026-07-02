package users

import (
	"certification-system/utils"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserRepository interface {
	FindAll(params utils.PaginationParam) ([]User, *utils.Pagination, error)
	FindById(id uint) (User, error)
	FindByUsername(username string) (User, error)
	FindByEmail(email string) (User, error)
	Create(user *User) error
	Update(user *User) error
	Delete(id uint) error
}

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) FindAll(param utils.PaginationParam) ([]User, *utils.Pagination, error) {
	var users []User
	query := r.db.Model(&User{})
	if param.Search != "" {
		query = query.Where(
			"username LIKE ? OR name LIKE ? OR email LIKE ?",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
		)
	}
	pagination, err := utils.Paginate(query, param, &users)
	if err != nil {
		return nil, nil, err
	}

	return users, pagination, nil
}

func (r *userRepository) FindByUsername(username string) (User, error) {
	var user User
	err := r.db.Where("username = ?", username).First(&user).Error
	return user, err
}

func (r *userRepository) FindByEmail(email string) (User, error) {
	var user User
	err := r.db.Where("email = ?", email).First(&user).Error
	return user, err
}

func (r *userRepository) FindById(id uint) (User, error) {
	var user User
	err := r.db.First(&user, id).Error
	return user, err
}

func (r *userRepository) Create(user *User) error {
	return r.db.Create(user).Error
}

func (r *userRepository) Update(user *User) error {
	// return r.db.Save(user).Error
	updates := map[string]interface{}{
		"username":   user.Username,
		"name":       user.Name,
		"email":      user.Email,
		"section":    user.Section,
		"role":       user.Role,
		"updated_at": time.Now(),
	}
	if user.Password != "" && !strings.HasPrefix(user.Password, "$2a$") {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		updates["password"] = string(hashedPassword)
	}

	return r.db.Model(&User{}).Where("id = ?", user.ID).Updates(updates).Error
}

func (r *userRepository) Delete(id uint) error {
	return r.db.Delete(&User{}, id).Error
}

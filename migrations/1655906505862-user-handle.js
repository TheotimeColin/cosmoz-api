const { user } = require('../api/entities/index')
const userId = require('../utils/user-id')

 async function up () {
  try {
    let users = await user.model.find()

    await Promise.all(users.map(async user => {
      let numbers = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
      let id = numbers[Math.floor(Math.random() * (numbers.length))] + numbers[Math.floor(Math.random() * (numbers.length))] + numbers[Math.floor(Math.random() * (numbers.length))] + numbers[Math.floor(Math.random() * (numbers.length))]

      let name = userId.names[Math.floor(Math.random() * (userId.names.length))]
      name += '.' + userId.adjectives[Math.floor(Math.random() * (userId.adjectives.length))]

      user.set('id', name + '.' + id)
      user.set('alias', user.name)

      return await user.save()
    }))
  } catch (e) {
    console.error(e)
    return false
  }
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };
